"use client";

import { useEffect } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { formatEther, type Address } from "viem";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

/**
 * DEV debug: logs exactly what the connected wallet (MetaMask) reports vs the app's RPC, so a
 * balance/chain/address mismatch is visible in the browser console. Renders nothing.
 */
export function WalletDebug() {
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  useEffect(() => {
    if (!address) return;
    const S = "color:#22d3ee;font-weight:bold";

    (async () => {
      console.log("%c[WalletDebug] wagmi", S, { address, chainId, connector: connector?.name });

      // 1) What MetaMask itself reports — via its injected EIP-1193 provider (uses MetaMask's own RPC).
      try {
        const provider = (await connector?.getProvider?.()) as Eip1193 | undefined;
        if (provider?.request) {
          const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
          const mmChainHex = (await provider.request({ method: "eth_chainId" })) as string;
          const balHex = (await provider.request({ method: "eth_getBalance", params: [address, "latest"] })) as string;
          console.log("%c[WalletDebug] MetaMask provider", S, {
            eth_accounts: accounts,
            eth_chainId: mmChainHex,
            chainIdDec: parseInt(mmChainHex, 16),
            eth_getBalance: balHex,
            balanceEth: formatEther(BigInt(balHex)),
            queriedAddress: address,
            addressMatchesAccount: accounts?.[0]?.toLowerCase() === address.toLowerCase(),
          });
        } else {
          console.warn("[WalletDebug] no injected provider on connector");
        }
      } catch (e) {
        console.error("[WalletDebug] MetaMask provider error", e);
      }

      // 2) What the app's configured RPC reports for the same address (sanity comparison).
      try {
        const bal = await publicClient?.getBalance({ address: address as Address });
        console.log("%c[WalletDebug] app RPC", S, {
          balanceEth: bal != null ? formatEther(bal) : null,
          wei: bal?.toString(),
        });
      } catch (e) {
        console.error("[WalletDebug] app RPC error", e);
      }
    })();
  }, [address, chainId, connector, publicClient]);

  return null;
}
