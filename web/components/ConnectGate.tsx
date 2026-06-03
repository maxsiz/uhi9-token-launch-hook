"use client";

import { type ReactNode } from "react";
import { useAccount, useChainId, useSwitchChain, useBytecode } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SUPPORTED_CHAINS, isSupportedChain } from "@/lib/config/chains";

/**
 * Wraps onchain actions. Handles: not-connected, unsupported chain, and (when `requireEoa`)
 * the EOA-only launch constraint — smart-contract wallets fail the hook's tx.origin anti-sandwich
 * check, so the wizard must block them (DESIGN.md §1, §6).
 */
export function ConnectGate({ children, requireEoa = false }: { children: ReactNode; requireEoa?: boolean }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: bytecode } = useBytecode({ address, query: { enabled: requireEoa && !!address } });

  if (!isConnected) {
    return (
      <div className="card flex flex-col items-center gap-3 text-center">
        <p className="text-neutral-300">Connect a wallet to continue.</p>
        <ConnectButton />
        <p className="text-xs text-neutral-500">MetaMask &amp; Rabby are detected automatically.</p>
      </div>
    );
  }

  if (!isSupportedChain(chainId)) {
    return (
      <div className="card space-y-3 text-center">
        <p className="text-amber-400">This network isn&apos;t supported.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {SUPPORTED_CHAINS.map((c) => (
            <button key={c.id} className="btn-ghost" onClick={() => switchChain({ chainId: c.id })}>
              Switch to {c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (requireEoa && bytecode && bytecode !== "0x") {
    return (
      <div className="card border-red-900/60 bg-red-950/30 text-sm">
        <p className="font-medium text-red-300">Smart-contract wallet detected</p>
        <p className="mt-1 text-neutral-300">
          A launch must be sent from an EOA (MetaMask / Rabby). The hook&apos;s anti-sandwich check
          requires <code className="font-mono">tx.origin == msg.sender</code>, which Safe / ERC-4337
          wallets cannot satisfy. Governance actions still work from any wallet.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
