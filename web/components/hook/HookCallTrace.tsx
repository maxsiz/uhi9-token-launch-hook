"use client";

import { decodeEventLog, type Log } from "viem";
import { TokenLaunchHookAbi } from "@/lib/config/abi";

/**
 * Post-transaction proof: parse the receipt's logs emitted by the hook and show which callbacks
 * actually fired on-chain and what they did (DESIGN.md §5.3). Turns a successful launch into a
 * visible demonstration that the hook ran.
 */
const EVENT_TO_TRACE: Record<string, { callback: string; line: string }> = {
  CampaignBootstrapped: {
    callback: "_beforeAddLiquidity",
    line: "Governance bootstrapped — captured the governance NFT and stored launch config.",
  },
  AntiSnipeInitialized: { callback: "_beforeAddLiquidity", line: "M1 AntiSnipe initialized." },
  BuySellTaxInitialized: { callback: "_beforeAddLiquidity", line: "M2 BuySellTax initialized." },
  LiquidityLockInitialized: { callback: "_beforeAddLiquidity", line: "M3 LiquidityLock initialized." },
  WhitelistPhaseInitialized: { callback: "_beforeAddLiquidity", line: "M5 WhitelistPhase initialized." },
  TaxApplied: { callback: "_beforeSwap", line: "M2 applied a dynamic tax fee to a swap." },
  AntiSnipeRejected: { callback: "_beforeSwap", line: "M1 rejected an over-cap buy." },
};

export function HookCallTrace({ logs }: { logs: Log[] }) {
  const traces: { callback: string; line: string }[] = [];
  for (const log of logs) {
    try {
      const parsed = decodeEventLog({ abi: TokenLaunchHookAbi, data: log.data, topics: log.topics });
      const t = EVENT_TO_TRACE[parsed.eventName as string];
      if (t) traces.push(t);
    } catch {
      // not a hook event — ignore
    }
  }
  if (traces.length === 0) return null;

  return (
    <div className="card mt-4">
      <h4 className="mb-2 text-sm font-semibold">Hook callbacks that fired on-chain</h4>
      <ul className="space-y-1 text-sm">
        {traces.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-xs text-blue-400">{t.callback}</span>
            <span className="text-neutral-300">{t.line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
