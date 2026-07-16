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
