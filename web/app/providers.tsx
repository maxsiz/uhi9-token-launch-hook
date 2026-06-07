"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig } from "wagmi";
import { injected, mock } from "wagmi/connectors";
import type { Address } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SUPPORTED_CHAINS, transports } from "@/lib/config/chains";

// Injected-only wallets (MetaMask, Rabby) — auto-discovered via EIP-6963 plus a generic `injected`
// fallback. No WalletConnect / RainbowKit, so no projectId is ever required.
//
// Dev-only burner: when NEXT_PUBLIC_DEV_BURNER_ADDRESS is set, use a wagmi `mock` connector for that
// address instead — for headless UI testing against an anvil fork started with `--auto-impersonate`.
const burner = process.env.NEXT_PUBLIC_DEV_BURNER_ADDRESS as Address | undefined;

const config = createConfig({
  chains: SUPPORTED_CHAINS,
  transports,
  connectors: burner ? [mock({ accounts: [burner] })] : [injected()],
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
