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

    (async () => {
      const out: Record<string, unknown> = {
        wagmi: { address, chainId, connector: connector?.name },
      };

      // 1) What MetaMask itself reports — via its injected EIP-1193 provider (uses MetaMask's own RPC).
      try {
        const provider = (await connector?.getProvider?.()) as Eip1193 | undefined;
        if (provider?.request) {
          const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
          const mmChainHex = (await provider.request({ method: "eth_chainId" })) as string;
          const balHex = (await provider.request({ method: "eth_getBalance", params: [address, "latest"] })) as string;
          out.metamask = {
            eth_accounts: accounts,
            eth_chainId: mmChainHex,
            chainIdDec: parseInt(mmChainHex, 16),
            eth_getBalance: balHex,
            balanceEth: formatEther(BigInt(balHex)),
            queriedAddress: address,
            addressMatchesAccount: accounts?.[0]?.toLowerCase() === address.toLowerCase(),
          };
        } else {
          out.metamask = "no injected provider on connector";
        }
      } catch (e) {
        out.metamaskError = String((e as Error)?.message ?? e);
      }

      // 2) What the app's configured RPC reports for the same address (sanity comparison).
      try {
        const bal = await publicClient?.getBalance({ address: address as Address });
        out.appRpc = { balanceEth: bal != null ? formatEther(bal) : null, wei: bal?.toString() };
      } catch (e) {
        out.appRpcError = String((e as Error)?.message ?? e);
      }

      // One flat, copy-friendly block.
      console.log("[WalletDebug]\n" + JSON.stringify(out, null, 2));
    })();
  }, [address, chainId, connector, publicClient]);

  return null;
}
