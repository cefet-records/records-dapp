import {
  DynamicContextProvider,
  DynamicWidget
} from "@dynamic-labs/sdk-react-core";
import {DynamicWagmiConnector} from "@dynamic-labs/wagmi-connector";
import {createConfig, WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {http} from "viem";
import {mainnet} from "viem/chains";
import {EthereumWalletConnectors} from "@dynamic-labs/ethereum";

const config = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: false,
  transports: {[mainnet.id]: http()}
});
const queryClient = new QueryClient();

export default function Home() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.DYNAMIC_KEY!,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <DynamicWidget />
    </DynamicContextProvider>
  );
}
