import { useReadContracts } from 'wagmi';
import { isAddress, formatUnits, zeroHash } from 'viem';
import { PRECOMPILES, stakingAbi, authorMappingAbi } from '../precompiles.js';
import { useBalances } from '../hooks/useBalances.js';

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
        ]
      : [],
    query: { enabled: valid, refetchInterval: 20_000 },
  });

  // Balance breakdown (transferable / reserved / locked / total) is read over
  // Substrate — the ERC-20 precompile can't see reserved funds or governance locks.
  const bal = useBalances(real);

  if (!valid) {
    return (
      <div className="card status-card empty">
        <p className="muted">Enter a valid Real account address to load its on-chain state.</p>
      </div>
    );
  }

  const [isCandidate, candidateCount, candDelegationCount, nimbusId] = (data || []).map((r) =>
    r && r.status === 'success' ? r.result : undefined
  );

  const hasKeys = nimbusId !== undefined && nimbusId !== zeroHash;
  const b = bal.data;
  const fmt = (v) =>
    b && v !== undefined
      ? `${Number(formatUnits(v, b.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${b.symbol || ''}`
      : bal.status === 'loading'
      ? '…'
      : '—';

  return (
    <div className="card status-card">
      <div className="status-head">
        <h3>On-chain state of Real account</h3>
        <button
          className="btn ghost sm"
          onClick={() => {
            refetch();
            bal.refetch();
          }}
          disabled={isLoading}
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {isError && <p className="alert error">Could not read on-chain state. Check the network/RPC.</p>}
      {bal.status === 'error' && (
        <p className="alert error">Could not read the balance breakdown over Substrate (WSS RPC).</p>
      )}

      <h4 className="status-subhead">Balance</h4>
      <div className="status-grid">
        <Stat label="Transferable" value={fmt(b?.transferable)} good={!!b} />
        <Stat label="Reserved (deposits)" value={fmt(b?.reserved)} />
        <Stat label="Locked (governance/staking)" value={fmt(b?.locked)} />
        <Stat label="Total" value={fmt(b?.total)} />
      </div>
      {b && b.reserved > 0n && b.reservedBreakdown?.length > 0 && (
        <dl className="param-list">
          {b.reservedBreakdown.map((r) => (
            <div key={r.label} className="param-row">
              <dt>
                Reserved · {r.label}
                {r.count ? ` (${r.count})` : ''}
              </dt>
              <dd className="mono">{fmt(r.amount)}</dd>
            </div>
          ))}
        </dl>
      )}

      {b?.proxies?.length > 0 && (
        <details className="deposit-detail">
          <summary>
            Proxies <span className="muted">({b.proxies.length})</span>
          </summary>
          <dl className="param-list">
            {b.proxies.map((p, i) => (
              <div key={`${p.delegate}-${i}`} className="param-row">
                <dt className="mono">
                  {p.delegate.slice(0, 8)}…{p.delegate.slice(-6)}
                </dt>
                <dd>
                  <span className="tag">{p.type}</span>
                  {p.delay > 0 ? <span className="muted"> · delay {p.delay}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {b?.identity && (
        <details className="deposit-detail">
          <summary>
            Identity {b.identity.fields?.length ? <span className="muted">({b.identity.fields.length} fields)</span> : null}
          </summary>
          {b.identity.fields?.length > 0 ? (
            <dl className="param-list">
              {b.identity.fields.map((f, i) => (
                <div key={`${f.key}-${i}`} className="param-row">
                  <dt>{f.key}</dt>
                  <dd className="mono">{f.value || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="hint">Identity registered (no readable fields).</p>
          )}
        </details>
      )}

      <h4 className="status-subhead">Collator / author mapping</h4>
      <div className="status-grid">
        <Stat label="Is candidate (collator)" value={fmtBool(isCandidate)} good={isCandidate === true} />
        <Stat label="Author mapping keys set" value={fmtBool(hasKeys)} good={hasKeys} />
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
