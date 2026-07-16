import { useReadContracts } from 'wagmi';
import { isAddress, zeroHash } from 'viem';
import { PRECOMPILES, stakingAbi, authorMappingAbi } from '../precompiles.js';

/**
 * Reads the two flags used to gate the offboarding steps:
 *   - isCandidate      → gates "schedule leave" (step 1)
 *   - hasAuthorKeys    → gates "remove keys"    (step 3)
 *
 * Values are `undefined` while loading or if the read fails, so callers should
 * only block when a flag is explicitly `false` (never block on unknown).
 */
export function useCollatorFlags(account) {
  const valid = isAddress(account);
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: valid
      ? [
          { address: PRECOMPILES.staking, abi: stakingAbi, functionName: 'isCandidate', args: [account] },
          { address: PRECOMPILES.authorMapping, abi: authorMappingAbi, functionName: 'nimbusIdOf', args: [account] },
        ]
      : [],
    query: { enabled: valid, refetchInterval: 20_000 },
  });

  const isCandidate = data?.[0]?.status === 'success' ? data[0].result : undefined;
  const nimbusId = data?.[1]?.status === 'success' ? data[1].result : undefined;
  const hasAuthorKeys = nimbusId === undefined ? undefined : nimbusId !== zeroHash;

  return { isCandidate, hasAuthorKeys };
}
