// Substrate (Polkadot.js) read layer — used only to read parachainStaking
// storage that the EVM staking precompile does not expose, namely a candidate's
// scheduled-exit round. @polkadot/api is imported lazily so it stays out of the
// initial bundle and only loads when a round check is actually needed.

const WS_ENDPOINTS = {
  1284: 'wss://wss.api.moonbeam.network',
  1285: 'wss://wss.api.moonriver.moonbeam.network',
  1287: 'wss://wss.api.moonbase.moonbeam.network',
};

// Moonbeam/Moonriver produce a block roughly every 6s (async backing).
export const BLOCK_SECONDS = 6;

export function hasSubstrateEndpoint(chainId) {
  return !!WS_ENDPOINTS[chainId];
}

// Cache one ApiPromise per chain so we don't reconnect on every read.
const apiCache = {};

async function getApi(chainId) {
  const endpoint = WS_ENDPOINTS[chainId];
  if (!endpoint) throw new Error(`No Substrate endpoint configured for chain ${chainId}.`);
  if (!apiCache[chainId]) {
    const { ApiPromise, WsProvider } = await import('@polkadot/api');
    apiCache[chainId] = ApiPromise.create({
      provider: new WsProvider(endpoint),
      noInitWarn: true,
    }).catch((err) => {
      // Don't cache a failed connection.
      delete apiCache[chainId];
      throw err;
    });
  }
  return apiCache[chainId];
}

/**
 * Reads the full native-balance breakdown for an account via Substrate. The EVM
 * ERC-20 precompile only exposes `balanceOf` (the transferable balance) — it has
 * no view of *reserved* funds (e.g. proxy deposits) or governance locks, so we
 * read them from `derive.balances.all`, which matches what Polkadot.js / Subscan
 * show. Amounts are returned as bigint in the token's smallest unit.
 */
export async function fetchBalances(chainId, account) {
  const api = await getApi(chainId);
  const decimals = api.registry.chainDecimals[0];
  const symbol = api.registry.chainTokens[0];
  const all = await api.derive.balances.all(account);
  const free = all.freeBalance.toBigInt();
  const reserved = all.reservedBalance.toBigInt();

  // Attribute the reserved balance to what created each deposit. Each query is
  // guarded so a missing pallet on some runtime doesn't break the whole read.
  const breakdown = [];
  let proxyCount = 0;
  let hasIdentity = false;
  let proxies = []; // [{ delegate, type, delay }]
  let identity = null; // { deposit, fields: [{ key, value }] }

  try {
    if (api.query.proxy?.proxies) {
      const [list, deposit] = await api.query.proxy.proxies(account);
      proxyCount = list.length;
      proxies = list.map((p) => ({
        delegate: p.delegate.toString(),
        type: p.proxyType.toString(),
        delay: p.delay.toNumber(),
      }));
      const d = deposit.toBigInt();
      if (d > 0n) breakdown.push({ label: 'Proxy', amount: d, count: proxyCount });
    }
    if (api.query.proxy?.announcements) {
      const [, deposit] = await api.query.proxy.announcements(account);
      const d = deposit.toBigInt();
      if (d > 0n) breakdown.push({ label: 'Proxy announcements', amount: d });
    }
  } catch {
    /* proxy pallet unavailable — skip */
  }

  try {
    if (api.query.identity?.identityOf) {
      const idOpt = await api.query.identity.identityOf(account);
      if (idOpt.isSome) {
        hasIdentity = true;
        const inner = idOpt.unwrap();
        // Runtime shape differs: some return the Registration directly, newer
        // ones a tuple [Registration, Option<Username>].
        const reg = inner.deposit !== undefined ? inner : inner[0];
        const d = reg?.deposit ? reg.deposit.toBigInt() : 0n;
        if (d > 0n) breakdown.push({ label: 'Identity', amount: d });
        identity = { deposit: d, fields: extractIdentityFields(reg?.info) };
      }
    }
    if (api.query.identity?.subsOf) {
      const [deposit] = await api.query.identity.subsOf(account);
      const d = deposit.toBigInt();
      if (d > 0n) breakdown.push({ label: 'Identity subs', amount: d });
    }
  } catch {
    /* identity pallet unavailable — skip */
  }

  const attributed = breakdown.reduce((s, b) => s + b.amount, 0n);
  const other = reserved - attributed;
  if (other > 0n) breakdown.push({ label: 'Other', amount: other });

  return {
    transferable: all.availableBalance.toBigInt(),
    reserved,
    free,
    locked: all.lockedBalance.toBigInt(),
    total: free + reserved,
    reservedBreakdown: breakdown,
    proxyCount,
    hasIdentity,
    proxies,
    identity,
    decimals,
    symbol,
  };
}

// Decode a `Data` value from an identity field to a readable string (Raw → UTF-8),
// returning null for `None`/empty.
function decodeData(d) {
  if (!d || d.isNone) return null;
  if (d.isRaw) {
    try {
      return new TextDecoder().decode(Uint8Array.from(d.asRaw));
    } catch {
      return d.asRaw.toString();
    }
  }
  return d.toString();
}

// Pull the set fields out of an IdentityInfo struct into [{ key, value }].
function extractIdentityFields(info) {
  if (!info) return [];
  const fields = [];
  const known = ['display', 'legal', 'web', 'matrix', 'riot', 'email', 'pgpFingerprint', 'image', 'twitter'];
  for (const k of known) {
    const v = info[k] ? decodeData(info[k]) : null;
    if (v) fields.push({ key: k, value: v });
  }
  if (info.additional?.length) {
    for (const [ak, av] of info.additional) {
      const key = decodeData(ak);
      if (key) fields.push({ key, value: decodeData(av) });
    }
  }
  return fields;
}

/**
 * Enumerates an account's conviction-voting activity across every track, plus the
 * per-track locks. Used to build a batch that removes votes and unlocks the freed
 * balance. Returns { tracks, decimals, symbol } where each track is
 * { trackId, type, votes:[pollIndex…], prior, lockedAmount, hasLock }.
 *
 * `votingFor.entries(account)` gives the casting votes (with poll indexes) and any
 * prior lock per track; `classLocksFor` gives the locked amount per track (and
 * surfaces tracks that only have a residual lock with no live votes).
 */
export async function fetchConvictionVotes(chainId, account) {
  const api = await getApi(chainId);
  const decimals = api.registry.chainDecimals[0];
  const symbol = api.registry.chainTokens[0];

  const [entries, locks] = await Promise.all([
    api.query.convictionVoting.votingFor.entries(account),
    api.query.convictionVoting.classLocksFor(account),
  ]);

  const lockMap = new Map();
  for (const [cls, amount] of locks) lockMap.set(cls.toNumber(), amount.toBigInt());

  const tracks = [];
  for (const [key, value] of entries) {
    const trackId = key.args[1].toNumber();
    let type = 'none';
    let votes = [];
    let prior = 0n;
    if (value.isCasting) {
      type = 'casting';
      votes = value.asCasting.votes.map(([idx]) => idx.toNumber());
      prior = value.asCasting.prior[1].toBigInt();
    } else if (value.isDelegating) {
      type = 'delegating';
      prior = value.asDelegating.prior[1].toBigInt();
    }
    tracks.push({ trackId, type, votes, prior });
  }

  // Tracks that only carry a residual lock (no votingFor entry) still need unlock.
  for (const [trackId] of lockMap) {
    if (!tracks.some((t) => t.trackId === trackId)) {
      tracks.push({ trackId, type: 'lockonly', votes: [], prior: 0n });
    }
  }

  for (const t of tracks) {
    t.lockedAmount = lockMap.get(t.trackId) ?? 0n;
    // Worth an unlock if there is a live lock, a prior lock, or votes to remove.
    t.hasLock = t.lockedAmount > 0n || t.prior > 0n || t.votes.length > 0;
  }

  tracks.sort((a, b) => a.trackId - b.trackId);
  return { tracks, decimals, symbol };
}

function deriveStatus({ round, infoOpt, currentBlock }) {
  const currentRound = round.current.toNumber();
  const roundLength = round.length.toNumber();
  const roundFirst = round.first.toNumber();

  if (infoOpt.isNone) {
    return { exists: false, currentRound, currentBlock, isLeaving: false, leavingRound: null, canExecute: false, secondsLeft: null };
  }

  const status = infoOpt.unwrap().status;
  const isLeaving = status.isLeaving;
  const leavingRound = isLeaving ? status.asLeaving.toNumber() : null;
  const canExecute = isLeaving && currentRound >= leavingRound;

  // The leaving round begins at the absolute block
  // `roundFirst + (leavingRound - currentRound) * roundLength`.
  let executableBlock = null;
  let secondsLeft = null;
  if (isLeaving) {
    executableBlock = roundFirst + (leavingRound - currentRound) * roundLength;
    if (!canExecute) secondsLeft = Math.max(0, (executableBlock - currentBlock) * BLOCK_SECONDS);
  }

  return { exists: true, currentRound, currentBlock, leavingRound, isLeaving, canExecute, executableBlock, secondsLeft };
}

/**
 * Subscribes (over the WSS connection) to the data needed to tell whether a
 * scheduled leave can be executed yet, pushing a fresh derived status on every
 * new block, round change, or candidateInfo change. Returns a Promise that
 * resolves to an unsubscribe function.
 *
 * Derived status: { exists, currentRound, currentBlock, isLeaving, leavingRound,
 * canExecute, secondsLeft }.
 */
export async function subscribeExitStatus(chainId, collator, onUpdate) {
  const api = await getApi(chainId);

  let round;
  let infoOpt;
  let currentBlock;
  const emit = () => {
    if (!round || infoOpt === undefined || currentBlock == null) return;
    onUpdate(deriveStatus({ round, infoOpt, currentBlock }));
  };

  const unsubs = await Promise.all([
    api.query.parachainStaking.round((r) => {
      round = r;
      emit();
    }),
    api.query.parachainStaking.candidateInfo(collator, (i) => {
      infoOpt = i;
      emit();
    }),
    api.rpc.chain.subscribeNewHeads((header) => {
      currentBlock = header.number.toNumber();
      emit();
    }),
  ]);

  return () => unsubs.forEach((u) => {
    try {
      u();
    } catch {
      /* already torn down */
    }
  });
}
