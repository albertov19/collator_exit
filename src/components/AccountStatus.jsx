import { useReadContracts } from 'wagmi';
import { isAddress, formatUnits, zeroHash } from 'viem';
import { PRECOMPILES, stakingAbi, authorMappingAbi, erc20Abi } from '../precompiles.js';

export default function AccountStatus({ real }) {
  const valid = isAddress(real);

  const { data, isLoading, isError, refetch } = useReadContracts({
    allowFailure: true,
    contracts: valid
      ? [
          { address: PRECOMPILES.staking, abi: stakingAbi, functionName: 'isCandidate', args: [real] },
          { address: PRECOMPILES.staking, abi: stakingAbi, functionName: 'candidateCount' },
          { address: PRECOMPILES.staking, abi: stakingAbi, functionName: 'candidateDelegationCount', args: [real] },
          { address: PRECOMPILES.authorMapping, abi: authorMappingAbi, functionName: 'nimbusIdOf', args: [real] },
          { address: PRECOMPILES.erc20, abi: erc20Abi, functionName: 'balanceOf', args: [real] },
          { address: PRECOMPILES.erc20, abi: erc20Abi, functionName: 'symbol' },
          { address: PRECOMPILES.erc20, abi: erc20Abi, functionName: 'decimals' },
        ]
      : [],
    query: { enabled: valid, refetchInterval: 20_000 },
  });

  if (!valid) {
    return (
      <div className="card status-card empty">
        <p className="muted">Enter a valid Real account address to load its on-chain state.</p>
      </div>
    );
  }

  const [isCandidate, candidateCount, candDelegationCount, nimbusId, balance, symbol, decimals] =
    (data || []).map((r) => (r && r.status === 'success' ? r.result : undefined));

  const hasKeys = nimbusId !== undefined && nimbusId !== zeroHash;
  const bal =
    balance !== undefined && decimals !== undefined
      ? `${Number(formatUnits(balance, decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol || ''}`
      : '—';

  return (
    <div className="card status-card">
      <div className="status-head">
        <h3>On-chain state of Real account</h3>
        <button className="btn ghost sm" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {isError && <p className="alert error">Could not read on-chain state. Check the network/RPC.</p>}
      <div className="status-grid">
        <Stat label="Is candidate (collator)" value={fmtBool(isCandidate)} good={isCandidate === true} />
        <Stat label="Author mapping keys set" value={fmtBool(hasKeys)} good={hasKeys} />
        <Stat label="Free balance" value={bal} />
        <Stat label="Total candidates" value={candidateCount !== undefined ? String(candidateCount) : '—'} />
        <Stat
          label="Delegations on Real acct"
          value={candDelegationCount !== undefined ? String(candDelegationCount) : '—'}
        />
        <Stat
          label="Nimbus ID"
          value={hasKeys ? `${nimbusId.slice(0, 10)}…${nimbusId.slice(-6)}` : 'none'}
          mono
        />
      </div>
    </div>
  );
}

function fmtBool(v) {
  if (v === undefined) return '—';
  return v ? 'Yes' : 'No';
}

function Stat({ label, value, good, mono }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${mono ? 'mono' : ''} ${good ? 'ok' : ''}`}>{value}</span>
    </div>
  );
}
