import { http, createConfig } from 'wagmi';
import { moonbeam, moonriver, moonbaseAlpha } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const SUPPORTED_CHAINS = [moonbeam, moonriver, moonbaseAlpha];

export const config = createConfig({
  chains: [moonbeam, moonriver, moonbaseAlpha],
  connectors: [injected()],
  transports: {
    [moonbeam.id]: http('https://rpc.api.moonbeam.network'),
    [moonriver.id]: http('https://rpc.api.moonriver.moonbeam.network'),
    [moonbaseAlpha.id]: http('https://rpc.api.moonbase.moonbeam.network'),
  },
});
