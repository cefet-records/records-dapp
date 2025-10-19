import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { getOrMapViemChain} from '@dynamic-labs/ethereum-core';
import { evmNetworks } from './chains.config';
import { createClient } from 'viem';

export const config = createConfig({
    chains: [
        mainnet,
        ...evmNetworks.map(getOrMapViemChain)
    ],
    client({ chain }) {
    return createClient({
      chain,
      transport: http(),
    });
  },
});