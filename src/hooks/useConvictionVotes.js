import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChainId } from 'wagmi';
import { isAddress } from 'viem';
import { fetchConvictionVotes, hasSubstrateEndpoint } from '../lib/substrate.js';

/**
 * Enumerates the account's conviction-voting votes and locks across all tracks.
 * Returns { status, tracks, totalVotes, tracksToUnlock, decimals, symbol,
 * error, refetch }. `status` is 'idle' | 'loading' | 'done' | 'error'.
 */
export function useConvictionVotes(account, { intervalMs = 20_000 } = {}) {
  const chainId = useChainId();
  const [state, setState] = useState({ status: 'idle' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isAddress(account) || !hasSubstrateEndpoint(chainId)) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState((s) => (s.status === 'done' ? s : { status: 'loading' }));

    const load = () =>
      fetchConvictionVotes(chainId, account)
        .then((data) => {
          if (!cancelled) setState({ status: 'done', ...data });
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

  const derived = useMemo(() => {
    const tracks = state.tracks || [];
    return {
      totalVotes: tracks.reduce((n, t) => n + t.votes.length, 0),
      tracksToUnlock: tracks.filter((t) => t.hasLock).map((t) => t.trackId),
    };
  }, [state.tracks]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, ...derived, refetch };
}
