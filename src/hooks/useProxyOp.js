import { useCallback, useState } from 'react';
import { usePublicClient, useSendTransaction, useAccount } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { encodeFunctionData } from 'viem';
import { config } from '../wagmi.js';
import { PRECOMPILES, proxyAbi } from '../precompiles.js';

// Recognize known on-chain revert reasons and map them to actionable guidance.
// Returns a message string for a recognized failure, or null when the error is
// not one we can explain (e.g. an opaque node "internal error").
function knownRevertMessage(err) {
  const text =
    (err?.shortMessage || '') + ' ' + (err?.details || '') + ' ' + (err?.message || '') + ' ' + (err?.cause?.message || '');
  if (/Not proxy/i.test(text)) {
    return 'Not proxy: your connected wallet is not registered as a proxy of the Real account. Add it as a proxy (type Any, or the type matching this action) first, or turn off "Execute via proxy".';
  }
  if (/CallFiltered/i.test(text)) {
    return 'CallFiltered: your proxy exists but its type does not permit this call. Use a proxy of the matching type — Staking for the leave-candidates steps, AuthorMapping for removeKeys, or Any.';
  }
  if (/Unannounced/i.test(text)) {
    return 'Unannounced: this proxy has an announcement delay. Only zero-delay proxies can be used here.';
  }
  if (/real address must be EOA/i.test(text)) {
    return 'The Real account must be an externally owned account (EOA), not a contract.';
  }
  return null;
}

/**
 * Generic hook to run one collator-offboarding operation, either wrapped in
 * proxy.proxy (useProxy = true) or sent directly from the connected wallet
 * (useProxy = false).
 *
 * `prepare` is an async function ({ publicClient, real, delegate }) that returns
 * { callTo, callData, details }:
 *   - callTo:  the target precompile the call dispatches to
 *   - callData: ABI-encoded inner call (built after reading on-chain params)
 *   - details: array of { label, value } describing resolved on-chain params
 */
export function useProxyOp(prepare, useProxy = true) {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();

  const [status, setStatus] = useState('idle'); // idle | preparing | simulating | signing | mining | success | error
  const [hash, setHash] = useState(null);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(null);

  const run = useCallback(
    async (real) => {
      setError(null);
      setHash(null);
      setDetails(null);
      let prepared;
      try {
        setStatus('preparing');
        prepared = await prepare({ publicClient, real, delegate: address });
        setDetails(prepared.details || null);
      } catch (err) {
        setStatus('error');
        setError(err);
        return;
      }

      // Build the outer tx: wrapped in proxy.proxy, or sent directly to the
      // target precompile from the connected wallet.
      const { to, data } = useProxy
        ? {
            to: PRECOMPILES.proxy,
            data: encodeFunctionData({
              abi: proxyAbi,
              functionName: 'proxy',
              args: [real, prepared.callTo, prepared.callData],
            }),
          }
        : { to: prepared.callTo, data: prepared.callData };

      // Preflight so we can surface the real revert reason instead of the
      // wallet's opaque "gas estimation failed".
      setStatus('simulating');
      try {
        await publicClient.call({ account: address, to, data });
      } catch (simErr) {
        const known = knownRevertMessage(simErr);
        if (known) {
          setStatus('error');
          setError(new Error(known));
          return;
        }
        // Unrecognized simulation error — don't block; let the wallet estimate.
      }

      try {
        setStatus('signing');
        const txHash = await sendTransactionAsync({ to, data });
        setHash(txHash);

        setStatus('mining');
        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status === 'success') {
          setStatus('success');
        } else {
          setStatus('error');
          setError(new Error('Transaction reverted on-chain.'));
        }
      } catch (err) {
        setStatus('error');
        const known = knownRevertMessage(err);
        setError(known ? new Error(known) : err);
      }
    },
    [prepare, publicClient, address, sendTransactionAsync, useProxy]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setHash(null);
    setError(null);
    setDetails(null);
  }, []);

  return { run, reset, status, hash, error, details };
}

// Helper re-export so callers can build inner calldata without re-importing viem.
export { encodeFunctionData, PRECOMPILES };
