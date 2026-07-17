import { useCallback, useEffect, useState } from 'react';
import { useChainId } from 'wagmi';
import { isAddress } from 'viem';
import { fetchBalances, hasSubstrateEndpoint } from '../lib/substrate.js';

/**
 * Reads the account's native-balance breakdown (transferable / reserved / locked
 * / total) over Substrate. Refreshes on an interval and exposes a manual refetch.
 * Returns { status, data, error, refetch } with status 'idle' | 'loading' |
 * 'done' | 'error'.
 */
export function useBalances(account, { intervalMs = 20_000 } = {}) {
  const chainId = useChainId();
  const [state, setState] = useState({ status: 'idle' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isAddress(account) || !hasSubstrateEndpoint(chainId)) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    // Keep prior data visible while refreshing to avoid layout flicker.
    setState((s) => (s.status === 'done' ? s : { status: 'loading' }));

    const load = () =>
      fetchBalances(chainId, account)
        .then((data) => {
          if (!cancelled) setState({ status: 'done', data });
        })
        .catch((error) => {
          if (!cancelled) setState({ status: 'error', error });
        });

    load();
    const id = intervalMs ? setInterval(load, intervalMs) : null;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [account, chainId, nonce, intervalMs]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refetch };
}
