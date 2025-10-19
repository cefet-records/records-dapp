import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { getOrMapViemChain } from '@dynamic-labs/ethereum-core';
import { dynamicHardhatNetwork } from './chains.config';

const hardhatViemChain = getOrMapViemChain(dynamicHardhatNetwork);

export const config = createConfig({
    chains: [
        mainnet,
        hardhatViemChain
    ],
    transports: {
        [mainnet.id]: http(),
        [hardhatViemChain.id]: http(hardhatViemChain.rpcUrls.default.http[0]),
    },
});