import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { isAddress, encodeFunctionData } from 'viem';
import { PRECOMPILES, stakingAbi, authorMappingAbi } from './precompiles.js';
import { useProxyOp } from './hooks/useProxyOp.js';
import { useExitStatus } from './hooks/useExitStatus.js';
import { useCollatorFlags } from './hooks/useCollatorFlags.js';
import ConnectBar from './components/ConnectBar.jsx';
import AccountStatus from './components/AccountStatus.jsx';
import OperationCard from './components/OperationCard.jsx';

export default function App() {
  const { address, isConnected, chain } = useAccount();
  const [real, setReal] = useState('');
  const [useProxy, setUseProxy] = useState(false);

  const supported = isConnected && chain && [1284, 1285, 1287].includes(chain.id);

  // The account the operations act on: the entered Real account when using a
  // proxy, otherwise the connected wallet acting on itself directly.
  const effectiveReal = useProxy ? real : address || '';
  const realValid = isAddress(effectiveReal);

  // --- Prepare functions: read on-chain params, then encode the inner call ---

  const prepareSchedule = useCallback(async ({ publicClient }) => {
    const candidateCount = await publicClient.readContract({
      address: PRECOMPILES.staking,
      abi: stakingAbi,
      functionName: 'candidateCount',
    });
    return {
      callTo: PRECOMPILES.staking,
      callData: encodeFunctionData({
        abi: stakingAbi,
        functionName: 'scheduleLeaveCandidates',
        args: [candidateCount],
      }),
      details: [{ label: 'candidateCount (on-chain)', value: String(candidateCount) }],
    };
  }, []);

  const prepareExecute = useCallback(async ({ publicClient, real }) => {
    const delegationCount = await publicClient.readContract({
      address: PRECOMPILES.staking,
      abi: stakingAbi,
      functionName: 'candidateDelegationCount',
      args: [real],
    });
    return {
      callTo: PRECOMPILES.staking,
      callData: encodeFunctionData({
        abi: stakingAbi,
        functionName: 'executeLeaveCandidates',
        args: [real, delegationCount],
      }),
      details: [
        { label: 'candidate', value: real },
        { label: 'candidateDelegationCount (on-chain)', value: String(delegationCount) },
      ],
    };
  }, []);

  const prepareRemoveKeys = useCallback(async () => {
    return {
      callTo: PRECOMPILES.authorMapping,
      callData: encodeFunctionData({ abi: authorMappingAbi, functionName: 'removeKeys', args: [] }),
      details: [{ label: 'call', value: 'removeKeys()' }],
    };
  }, []);

  const scheduleOp = useProxyOp(prepareSchedule, useProxy);
  const executeOp = useProxyOp(prepareExecute, useProxy);
  const removeKeysOp = useProxyOp(prepareRemoveKeys, useProxy);

  const exit = useExitStatus(effectiveReal);
  const flags = useCollatorFlags(effectiveReal);

  const gateReason = !isConnected
    ? 'Connect your wallet first.'
    : !supported
    ? 'Switch to Moonbeam, Moonriver, or Moonbase Alpha.'
    : !realValid
    ? useProxy
      ? 'Enter a valid Real account address.'
      : 'Connect a wallet to act as.'
    : null;
  const gated = !!gateReason;

  // Step 1 (schedule leave): only for an active candidate that isn't already leaving.
  const scheduleReason =
    gateReason ||
    (flags.isCandidate === false
      ? 'This account is not a candidate — nothing to leave.'
      : exit.status === 'done' && exit.isLeaving
      ? 'A leave is already scheduled — proceed to “Execute leave”.'
      : null);

  // Step 3 (remove keys): only meaningful if author-mapping keys are set.
  const removeKeysReason =
    gateReason || (flags.hasAuthorKeys === false ? 'This account has no author-mapping keys to remove.' : null);

  // Step 2 (execute leave): the scheduled exit must have reached its round.
  let executeReason = gateReason;
  if (!gated) {
    if (exit.status === 'loading') executeReason = 'Checking round status…';
    else if (exit.status === 'done' && !exit.exists) executeReason = 'This account is not an active candidate.';
    else if (exit.status === 'done' && exit.exists && !exit.isLeaving)
      executeReason = 'No leave scheduled yet — run “Schedule leave” first.';
    else if (exit.status === 'done' && exit.isLeaving && !exit.canExecute)
      executeReason = `Not executable yet — ~${formatDuration(exit.secondsLeft)} left (exit round ${exit.leavingRound}).`;
  }
  const executeDisabled = !!executeReason;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">🌙</span>
          <div>
            <h1>Collator Offboarding</h1>
            <p className="muted">Moonbeam / Moonriver · staking &amp; author-mapping precompiles</p>
          </div>
        </div>
        <ConnectBar />
      </header>

      <main>
        <section className="card intro">
          <p>
            Offboard a collator using your Ethereum wallet. Each action calls the Moonbeam staking and
            author-mapping precompiles — either <strong>directly</strong> from your connected wallet, or wrapped in{' '}
            <code>proxy.proxy(real, callTo, callData)</code> to act on behalf of a <strong>Real account</strong> you
            hold proxy rights for. Parameters other than the Real account are read on-chain automatically.
          </p>
          <div className="callout">
            <strong>Proxy mode:</strong> when enabled, your connected wallet must be registered as a proxy of the
            Real account (type <em>Any</em>, or <em>Staking</em> for the leave-candidates steps and{' '}
            <em>AuthorMapping</em> for removeKeys). Disable it to act directly as the connected wallet.
          </div>
        </section>

        <section className="card real-input">
          <div className="real-head">
            <label htmlFor="real">{useProxy ? 'Real account (the collator you are a proxy for)' : 'Acting account'}</label>
            <label className="checkbox">
              <input type="checkbox" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} />
              Execute via proxy
            </label>
          </div>
          {useProxy ? (
            <>
              <input
                id="real"
                className="mono"
                placeholder="0x…"
                value={real}
                spellCheck={false}
                onChange={(e) => setReal(e.target.value.trim())}
              />
              {real && !realValid && <span className="hint error">Not a valid EVM address.</span>}
            </>
          ) : (
            <div className="direct-note mono">
              {address ? address : 'Connect a wallet'} — acting directly, no proxy wrapping.
            </div>
          )}
        </section>

        <AccountStatus real={effectiveReal} />

        <div className="steps-header">
          <h2>Offboarding steps</h2>
          <p className="muted">Steps 1 → 2 are sequential and separated by the network's leave delay.</p>
        </div>

        <OperationCard
          step="1"
          title="Schedule leave candidates"
          description="Signals intent to stop collating. Starts the exit delay countdown. Reads candidateCount on-chain."
          actionLabel="Schedule leave"
          op={scheduleOp}
          real={effectiveReal}
          disabled={!!scheduleReason}
          disabledReason={scheduleReason}
        />

        <OperationCard
          step="2"
          title="Execute leave candidates"
          description="Finalizes the exit once the leave delay has elapsed. Reads candidateDelegationCount on-chain. Gated on the on-chain round vs. the scheduled exit round."
          actionLabel="Execute leave"
          op={executeOp}
          real={effectiveReal}
          disabled={executeDisabled}
          disabledReason={executeReason}
        >
          <RoundStatus exit={exit} realValid={realValid && !gated} />
        </OperationCard>

        <OperationCard
          step="3"
          title="Remove author mapping keys"
          description="Unmaps the collator's Nimbus / session keys from the account. No parameters required."
          actionLabel="Remove keys"
          op={removeKeysOp}
          real={effectiveReal}
          disabled={!!removeKeysReason}
          disabledReason={removeKeysReason}
        />

        <footer className="app-footer muted">
          Proxy <code>{PRECOMPILES.proxy}</code> · Staking <code>{PRECOMPILES.staking}</code> · AuthorMapping{' '}
          <code>{PRECOMPILES.authorMapping}</code>
        </footer>
      </main>
    </div>
  );
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${r}s`;
  return `${r}s`;
}

function RoundStatus({ exit, realValid }) {
  // Tick every second so the countdown updates live between chain re-anchors.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!realValid) return null;
  if (exit.status === 'loading') return <p className="hint">Checking round status…</p>;
  if (exit.status === 'error')
    return (
      <p className="hint error">
        Couldn't read the round status (Substrate RPC). You can still attempt — it will revert if not yet executable.{' '}
        <button className="link-inline" onClick={exit.refetch}>retry</button>
      </p>
    );
  if (exit.status !== 'done') return null;

  // The status is driven live by the WSS subscription (a fresh block every ~6s);
  // interpolate locally each second so the countdown ticks smoothly between blocks.
  const elapsed = exit.fetchedAt ? (Date.now() - exit.fetchedAt) / 1000 : 0;
  const remaining = exit.secondsLeft != null ? Math.max(0, exit.secondsLeft - elapsed) : null;

  return (
    <div className="round-status">
      <span className="rs-item">
        Round <strong>{exit.currentRound}</strong>
      </span>
      {!exit.exists ? (
        <span className="rs-item warn">Not an active candidate</span>
      ) : !exit.isLeaving ? (
        <span className="rs-item warn">No leave scheduled</span>
      ) : exit.canExecute ? (
        <span className="rs-item ok">
          ✓ Ready — target block <strong>{exit.executableBlock}</strong> (round {exit.leavingRound}) reached
        </span>
      ) : (
        <span className="rs-item warn">
          ~<strong>{formatDuration(remaining)}</strong> left · block <strong>{exit.currentBlock}</strong> →{' '}
          <strong>{exit.executableBlock}</strong> (exit round {exit.leavingRound})
        </span>
      )}
      <span className="rs-updated">
        <span className="live-dot" /> live
      </span>
    </div>
  );
}
