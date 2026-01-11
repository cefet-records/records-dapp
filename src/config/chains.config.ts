import { EvmNetwork } from "@dynamic-labs/sdk-react-core"

export const evmNetworks: EvmNetwork[] = [
{
    blockExplorerUrls: ['https://polygonscan.com/'],
    chainId: 137,
    chainName: 'Matic Mainnet',
    iconUrls: ["https://app.dynamic.xyz/assets/networks/polygon.svg"],
    name: 'Polygon',
    nativeCurrency: {
      decimals: 18,
      name: 'MATIC',
      symbol: 'MATIC',
      iconUrl: 'https://app.dynamic.xyz/assets/networks/polygon.svg',
    },
    networkId: 137,
    rpcUrls: ['https://polygon-rpc.com'],
    vanityName: 'Polygon',
  },
  {
    chainId: 31337,
    networkId: 31337,
    chainName: 'Hardhat Localnet',
    name: 'Hardhat',
    vanityName: 'Hardhat',
    iconUrls: [],
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: ['http://127.0.0.1:8545'],
    blockExplorerUrls: [],
  },
]
