import { useChainId } from 'wagmi';

const EXPLORERS = {
  1284: 'https://moonbeam.moonscan.io',
  1285: 'https://moonriver.moonscan.io',
  1287: 'https://moonbase.moonscan.io',
};

export function useBlockExplorer() {
  const chainId = useChainId();
  return EXPLORERS[chainId] || null;
}
