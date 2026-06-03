"use client";

import { CALLBACK_COLOR, HOOK_MAP, type HookFeatureKey } from "@/lib/hook/hookMap";

/**
 * Compact chip showing which hook callback(s) + mechanism a control exercises.
 * The core of the "this is a demo for the hook" requirement (DESIGN.md §5).
 */
export function HookBadge({ feature }: { feature: HookFeatureKey }) {
  const f = HOOK_MAP[feature];
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {f.callbacks.map((cb) => (
        <span
          key={cb}
          className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
          style={{ backgroundColor: `${CALLBACK_COLOR[cb]}22`, color: CALLBACK_COLOR[cb] }}
          title={`Runs in the hook's ${cb} callback`}
        >
          {cb}
        </span>
      ))}
      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-300">
        {f.mechanism}
      </span>
    </span>
  );
}
