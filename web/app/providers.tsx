"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { SUPPORTED_CHAINS, transports } from "@/lib/config/chains";

// RainbowKit + wagmi config. Injected wallets (MetaMask, Rabby) are auto-discovered via EIP-6963;
// WalletConnect (mobile) is included when a project id is set.
const config = getDefaultConfig({
  appName: "TokenLaunchHook Studio",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "DEMO_PROJECT_ID",
  chains: SUPPORTED_CHAINS,
  transports,
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
