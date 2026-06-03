"use client";

import type { Hex } from "viem";
import { useReadContracts } from "wagmi";
import { TokenLaunchHookAbi } from "@/lib/config/abi";
import { HookBadge } from "./HookBadge";
import { taxUnitsToPercent } from "@/lib/format";

/**
 * Dashboard widget: reads the hook's view functions live and maps each value back to the callback
 * that produces it — a real-time window into the hook's per-pool state (DESIGN.md §5.3).
 */
export function HookActivityPanel({ hook, pid }: { hook: Hex; pid: Hex }) {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: hook, abi: TokenLaunchHookAbi, functionName: "launchPhaseOf", args: [pid] },
      { address: hook, abi: TokenLaunchHookAbi, functionName: "effectiveBuyTaxOf", args: [pid] },
      { address: hook, abi: TokenLaunchHookAbi, functionName: "effectiveSellTaxOf", args: [pid] },
      { address: hook, abi: TokenLaunchHookAbi, functionName: "isUnlocked", args: [pid] },
      { address: hook, abi: TokenLaunchHookAbi, functionName: "cumulativeVolumeOf", args: [pid] },
    ],
  });

  if (isLoading) return <div className="card text-sm text-neutral-400">Reading hook state…</div>;

  const phase = Number(data?.[0]?.result ?? 0);
  const buyTax = Number(data?.[1]?.result ?? 0);
  const sellTax = Number(data?.[2]?.result ?? 0);
  const unlocked = Boolean(data?.[3]?.result ?? false);
  const volume = (data?.[4]?.result as bigint | undefined) ?? 0n;
  const phaseLabel = ["Pre", "Active", "Frozen"][phase] ?? "—";

  const rows = [
    { label: "Launch phase", value: phaseLabel, feature: "launch.duration" as const },
    { label: "Effective buy tax", value: `${taxUnitsToPercent(buyTax)}%`, feature: "tax" as const },
    { label: "Effective sell tax", value: `${taxUnitsToPercent(sellTax)}%`, feature: "tax" as const },
    { label: "Liquidity unlocked", value: unlocked ? "yes" : "no", feature: "lock" as const },
    { label: "Cumulative volume", value: volume.toString(), feature: "lock" as const },
  ];

  return (
    <div className="card">
      <h4 className="mb-3 text-sm font-semibold">Live hook state</h4>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-neutral-400">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{r.value}</span>
              <HookBadge feature={r.feature} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
