"use client";

import { HOOK_MAP, type HookFeatureKey } from "@/lib/hook/hookMap";
import { HookBadge } from "./HookBadge";

/**
 * Expandable explainer: badges + plain-language on-chain effect + a link to the source module.
 * Use as the header of every mechanism sub-form and governance action (DESIGN.md §5.3).
 */
export function HookExplainer({ feature }: { feature: HookFeatureKey }) {
  const f = HOOK_MAP[feature];
  const repo = "https://github.com/maxsiz/uhi9-token-launch-hook/blob/master/";
  return (
    <details className="group rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-sm">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <span className="font-medium">{f.label}</span>
        <HookBadge feature={feature} />
        <span className="ml-auto text-xs text-neutral-500 group-open:hidden">what does the hook do? ▾</span>
      </summary>
      <p className="mt-2 text-neutral-300">{f.effect}</p>
      <a
        href={`${repo}${f.source}`}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block font-mono text-xs text-blue-400 hover:underline"
      >
        {f.source} ↗
      </a>
    </details>
  );
}
