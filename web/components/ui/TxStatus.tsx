import type { Hex } from "viem";

import { EXPLORER, type SupportedChainId } from "@/lib/config/chains";
import { Spinner } from "./Spinner";

export type TxPhase = "confirm" | "pending" | undefined;

/**
 * Inline transaction-status indicator (web3 best practice): distinguishes "confirm in wallet" from
 * "transaction pending" (the silent mining wait), and links the pending tx to the explorer. Renders
 * nothing when idle.
 */
export function TxStatus({ phase, hash, chainId }: { phase: TxPhase; hash?: Hex; chainId: SupportedChainId }) {
  if (!phase) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-400">
      <Spinner className="h-3.5 w-3.5 text-blue-400" />
      {phase === "confirm" ? "Confirm in your wallet…" : "Transaction pending…"}
      {phase === "pending" && hash && (
        <a className="text-blue-400 hover:underline" href={`${EXPLORER[chainId]}/tx/${hash}`} target="_blank" rel="noreferrer">
          View ↗
        </a>
      )}
    </div>
  );
}
