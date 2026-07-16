import { useEffect, useState } from 'react';
import { useChainId } from 'wagmi';
import { isAddress } from 'viem';
import { subscribeExitStatus, hasSubstrateEndpoint } from '../lib/substrate.js';

/**
 * Live subscription to the collator's scheduled-exit status (via Substrate WSS)
 * so the UI can gate "execute leave" and show a live countdown. Updates on every
 * new block / round change / candidateInfo change.
 *
 * Returns { status, currentRound, currentBlock, isLeaving, leavingRound,
 * canExecute, secondsLeft, exists, fetchedAt, error, refetch } where status is
 * 'idle' | 'loading' | 'done' | 'error'.
 */
export function useExitStatus(collator) {
  const chainId = useChainId();
  const [state, setState] = useState({ status: 'idle' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isAddress(collator) || !hasSubstrateEndpoint(chainId)) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    let unsub = null;
    setState({ status: 'loading' });

    subscribeExitStatus(chainId, collator, (data) => {
      if (!cancelled) setState({ status: 'done', fetchedAt: Date.now(), ...data });
    })
      .then((fn) => {
        if (cancelled) fn();
        else unsub = fn;
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', error });
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [collator, chainId, nonce]);

  return { ...state, refetch: () => setNonce((n) => n + 1) };
}
