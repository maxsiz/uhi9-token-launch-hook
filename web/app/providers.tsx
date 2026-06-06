"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig } from "wagmi";
import { mock } from "wagmi/connectors";
import type { Address } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { SUPPORTED_CHAINS, transports } from "@/lib/config/chains";

// Dev-only burner: when NEXT_PUBLIC_DEV_BURNER_ADDRESS is set, use a wagmi `mock` connector for that
// address instead of real wallets — for headless UI testing against an anvil fork started with
// `--auto-impersonate` (anvil signs txs for the impersonated address, so no private key is needed).
const burner = process.env.NEXT_PUBLIC_DEV_BURNER_ADDRESS as Address | undefined;

const config = burner
  ? createConfig({ chains: SUPPORTED_CHAINS, transports, connectors: [mock({ accounts: [burner] })], ssr: true })
  : // RainbowKit + wagmi config. Injected wallets (MetaMask, Rabby) are auto-discovered via EIP-6963;
    // WalletConnect (mobile) is included when a project id is set.
    getDefaultConfig({
      appName: "TokenLaunchHook Studio",
      // `||` (not `??`) so a blank env var also falls back — RainbowKit throws on an empty projectId.
      // The placeholder lets injected wallets (MetaMask/Rabby) work; WalletConnect needs a real id.
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "DEMO_PROJECT_ID",
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
