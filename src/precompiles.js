// Moonbeam/Moonriver/Moonbase Alpha precompile addresses.
// These are identical across all three networks.
export const PRECOMPILES = {
  proxy: '0x000000000000000000000000000000000000080b',
  staking: '0x0000000000000000000000000000000000000800',
  authorMapping: '0x0000000000000000000000000000000000000807',
  erc20: '0x0000000000000000000000000000000000000802',
  convictionVoting: '0x0000000000000000000000000000000000000812',
  batch: '0x0000000000000000000000000000000000000808',
  identity: '0x0000000000000000000000000000000000000818',
};

// Proxy type enum ordering used by the proxy precompile.
export const PROXY_TYPES = [
  'Any', // 0
  'NonTransfer', // 1
  'Governance', // 2
  'Staking', // 3
  'CancelProxy', // 4
  'Balances', // 5
  'AuthorMapping', // 6
  'IdentityJudgement', // 7
];

// --- Proxy precompile (0x...080b) ---
export const proxyAbi = [
  {
    type: 'function',
    name: 'proxy',
    stateMutability: 'payable',
    inputs: [
      { name: 'real', type: 'address' },
      { name: 'callTo', type: 'address' },
      { name: 'callData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'proxyForceType',
    stateMutability: 'payable',
    inputs: [
      { name: 'real', type: 'address' },
      { name: 'forceProxyType', type: 'uint8' },
      { name: 'callTo', type: 'address' },
      { name: 'callData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isProxy',
    stateMutability: 'view',
    inputs: [
      { name: 'real', type: 'address' },
      { name: 'delegate', type: 'address' },
      { name: 'proxyType', type: 'uint8' },
      { name: 'delay', type: 'uint32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    // Removes every proxy delegation registered by the caller (refunds the deposit).
    type: 'function',
    name: 'removeProxies',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
];

// --- Identity precompile (0x...0818) ---
export const identityAbi = [
  {
    // Clears the caller's identity registration (refunds the deposit).
    type: 'function',
    name: 'clearIdentity',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
];

// --- Staking precompile (0x...0800) ---
export const stakingAbi = [
  {
    type: 'function',
    name: 'scheduleLeaveCandidates',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'candidateCount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeLeaveCandidates',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'candidate', type: 'address' },
      { name: 'candidateDelegationCount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelLeaveCandidates',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'candidateCount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'candidateCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'candidateDelegationCount',
    stateMutability: 'view',
    inputs: [{ name: 'candidate', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isCandidate',
    stateMutability: 'view',
    inputs: [{ name: 'candidate', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

// --- Author Mapping precompile (0x...0807) ---
export const authorMappingAbi = [
  {
    type: 'function',
    name: 'removeKeys',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'nimbusIdOf',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
];

// --- Conviction Voting precompile (0x...0812) ---
// Only the calls needed to remove votes and unlock the freed balance.
// `removeVoteForTrack` (not the bare `removeVote`) is used so removals also work
// for *finished* referenda — the track/class is passed explicitly, which the
// pallet needs once a poll is no longer ongoing.
export const convictionVotingAbi = [
  {
    type: 'function',
    name: 'removeVote',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'pollIndex', type: 'uint32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'removeVoteForTrack',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pollIndex', type: 'uint32' },
      { name: 'trackId', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unlock',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'trackId', type: 'uint16' },
      { name: 'target', type: 'address' },
    ],
    outputs: [],
  },
];

// --- Batch precompile (0x...0808) ---
// batchAll reverts the whole transaction if any subcall reverts (all-or-nothing),
// which is what we want for remove-then-unlock so partial state can't linger.
export const batchAbi = [
  {
    type: 'function',
    name: 'batchAll',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address[]' },
      { name: 'value', type: 'uint256[]' },
      { name: 'callData', type: 'bytes[]' },
      { name: 'gasLimit', type: 'uint64[]' },
    ],
    outputs: [],
  },
];

// --- Native token ERC-20 precompile (0x...0802) — read-only balance display ---
export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
];
