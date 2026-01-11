import { createConfig, http } from 'wagmi'
import { getOrMapViemChain } from '@dynamic-labs/ethereum-core'
import { evmNetworks } from './chains.config'
import { createClient } from 'viem'

const isDevelopment = false
const POLYGON_RPC = process.env.NEXT_PUBLIC_POLYGON_RPC;
const HARDHAT_RPC = 'http://127.0.0.1:8545';

const polygonNetwork = getOrMapViemChain(
  evmNetworks.find(n => n.chainId === 137)!
)

const hardhatNetwork = evmNetworks.find(n => n.chainId === 31337)
  ? getOrMapViemChain(
      evmNetworks.find(n => n.chainId === 31337)!
    )
  : undefined

export const config = createConfig({
  chains: isDevelopment && hardhatNetwork
    ? [polygonNetwork, hardhatNetwork]
    : [polygonNetwork],

  client({ chain }) {
    return createClient({
      chain,
      transport: http(
        chain.id === 31337
          ? HARDHAT_RPC
          : POLYGON_RPC
      ),
    })
  },
});
