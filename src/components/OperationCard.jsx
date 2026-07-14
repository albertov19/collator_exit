import { useBlockExplorer } from '../hooks/useBlockExplorer.js';

const STATUS_LABEL = {
  idle: '',
  preparing: 'Reading on-chain parameters…',
  simulating: 'Simulating call…',
  signing: 'Confirm in your wallet…',
  mining: 'Waiting for confirmation…',
  success: 'Success',
  error: 'Failed',
};

function shortError(error) {
  if (!error) return '';
  // viem errors carry a concise `shortMessage`; fall back to message.
  return error.shortMessage || error.details || error.message || String(error);
}

export default function OperationCard({
  step,
  title,
  description,
  actionLabel,
  op,
  disabled,
  disabledReason,
  real,
  children,
  variant = 'default',
}) {
  const explorer = useBlockExplorer();
  const busy =
    op.status === 'preparing' ||
    op.status === 'simulating' ||
    op.status === 'signing' ||
    op.status === 'mining';

  return (
    <section className={`card op-card ${variant}`}>
      <div className="op-head">
        {step != null && <span className="step-badge">{step}</span>}
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
      </div>

      {children && <div className="op-body">{children}</div>}

      {op.details && op.details.length > 0 && (
        <dl className="param-list">
          {op.details.map((d) => (
            <div key={d.label} className="param-row">
              <dt>{d.label}</dt>
              <dd className="mono">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="op-actions">
        <button
          className="btn primary"
          disabled={disabled || busy}
          onClick={() => op.run(real)}
          title={disabled ? disabledReason : undefined}
        >
          {busy ? <span className="spinner" /> : null}
          {busy ? STATUS_LABEL[op.status] : actionLabel}
        </button>
        {disabled && disabledReason && (
          <span className="hint">{disabledReason}</span>
        )}
      </div>

      {op.status === 'success' && (
        <div className="alert success">
          ✓ Confirmed.{' '}
          {op.hash && explorer && (
            <a href={`${explorer}/tx/${op.hash}`} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          )}
        </div>
      )}
      {op.status === 'error' && (
        <div className="alert error">
          <strong>Failed:</strong> {shortError(op.error)}
          {op.hash && explorer && (
            <>
              {' '}
              <a href={`${explorer}/tx/${op.hash}`} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            </>
          )}
        </div>
      )}
      {op.status === 'mining' && op.hash && explorer && (
        <div className="alert info">
          Broadcast:{' '}
          <a href={`${explorer}/tx/${op.hash}`} target="_blank" rel="noreferrer">
            {op.hash.slice(0, 10)}…{op.hash.slice(-8)} ↗
          </a>
        </div>
      )}
    </section>
  );
}
