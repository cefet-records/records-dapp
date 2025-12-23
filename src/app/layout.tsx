"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { WagmiProvider } from "wagmi";
import { config } from "@/config/wagmi.config";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { evmNetworks } from "@/config/chains.config";
import './globals.css';
import { Roboto } from 'next/font/google'
import { SnackbarProvider } from "@/components/snackbar/snackbar-context";

const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
})

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={roboto.className}>
        <DynamicContextProvider
          settings={{
            environmentId: process.env.NEXT_PUBLIC_DYNAMIC_KEY!,
            walletConnectors: [EthereumWalletConnectors],
            overrides: {evmNetworks}
          }}
        >
          <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <DynamicWagmiConnector>
                <SnackbarProvider>
                  {children}
                </SnackbarProvider>
              </DynamicWagmiConnector>
            </QueryClientProvider>
          </WagmiProvider>
        </DynamicContextProvider>
      </body>
    </html>
  );
}
