import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { SUPPORTED_CHAINS } from '../wagmi.js';

function short(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function ConnectBar() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const injected = connectors.find((c) => c.id === 'injected') || connectors[0];
  const unsupported = isConnected && !SUPPORTED_CHAINS.some((c) => c.id === chain?.id);

  return (
    <div className="connect-bar">
      <div className="net-switch">
        {SUPPORTED_CHAINS.map((c) => (
          <button
            key={c.id}
            className={`chip ${chainId === c.id ? 'active' : ''}`}
            onClick={() => switchChain({ chainId: c.id })}
            disabled={!isConnected}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="wallet-box">
        {isConnected ? (
          <>
            {unsupported && <span className="badge warn">Unsupported network</span>}
            <span className="addr mono" title={address}>
              {short(address)}
            </span>
            <button className="btn ghost" onClick={() => disconnect()}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn primary" disabled={isPending} onClick={() => connect({ connector: injected })}>
            {isPending ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </div>
  );
}
