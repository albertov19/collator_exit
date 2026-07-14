import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
import { isAddress, encodeFunctionData } from 'viem';
import { PRECOMPILES, stakingAbi, authorMappingAbi } from './precompiles.js';
import { useProxyOp } from './hooks/useProxyOp.js';
import ConnectBar from './components/ConnectBar.jsx';
import AccountStatus from './components/AccountStatus.jsx';
import OperationCard from './components/OperationCard.jsx';

export default function App() {
  const { isConnected, chain } = useAccount();
  const [real, setReal] = useState('');

  const realValid = isAddress(real);
  const supported = isConnected && chain && [1284, 1285, 1287].includes(chain.id);

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

  const scheduleOp = useProxyOp(prepareSchedule);
  const executeOp = useProxyOp(prepareExecute);
  const removeKeysOp = useProxyOp(prepareRemoveKeys);

  const gateReason = !isConnected
    ? 'Connect your wallet first.'
    : !supported
    ? 'Switch to Moonbeam, Moonriver, or Moonbase Alpha.'
    : !realValid
    ? 'Enter a valid Real account address.'
    : null;
  const gated = !!gateReason;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo">🌙</span>
          <div>
            <h1>Collator Offboarding</h1>
            <p className="muted">Moonbeam / Moonriver · via the proxy precompile</p>
          </div>
        </div>
        <ConnectBar />
      </header>

      <main>
        <section className="card intro">
          <p>
            Execute collator-offboarding operations on behalf of a <strong>Real account</strong> using your
            connected wallet's proxy rights. Each action is wrapped in{' '}
            <code>proxy.proxy(real, callTo, callData)</code> and dispatched through Moonbeam precompiles — no
            Substrate tooling required. All parameters other than the Real account are read on-chain automatically.
          </p>
          <div className="callout">
            <strong>Prerequisite:</strong> your connected wallet must already be registered as a proxy of the Real
            account — proxy type <em>Any</em>, or the matching type: <em>Staking</em> for the leave-candidates steps
            and <em>AuthorMapping</em> for removeKeys.
          </div>
        </section>

        <section className="card real-input">
          <label htmlFor="real">Real account (the collator you are a proxy for)</label>
          <input
            id="real"
            className="mono"
            placeholder="0x…"
            value={real}
            spellCheck={false}
            onChange={(e) => setReal(e.target.value.trim())}
          />
          {real && !realValid && <span className="hint error">Not a valid EVM address.</span>}
        </section>

        <AccountStatus real={real} />

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
          real={real}
          disabled={gated}
          disabledReason={gateReason}
        />

        <OperationCard
          step="2"
          title="Execute leave candidates"
          description="Finalizes the exit after the delay has elapsed. Reads candidateDelegationCount(real) on-chain and uses the Real account as the candidate."
          actionLabel="Execute leave"
          op={executeOp}
          real={real}
          disabled={gated}
          disabledReason={gateReason}
        />

        <OperationCard
          step="3"
          title="Remove author mapping keys"
          description="Unmaps the collator's Nimbus / session keys from the Real account. No parameters required."
          actionLabel="Remove keys"
          op={removeKeysOp}
          real={real}
          disabled={gated}
          disabledReason={gateReason}
        />

        <footer className="app-footer muted">
          Proxy <code>{PRECOMPILES.proxy}</code> · Staking <code>{PRECOMPILES.staking}</code> · AuthorMapping{' '}
          <code>{PRECOMPILES.authorMapping}</code>
        </footer>
      </main>
    </div>
  );
}
