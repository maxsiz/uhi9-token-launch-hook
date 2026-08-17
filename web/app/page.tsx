import Link from "next/link";
import type { Metadata } from "next";
import { HOOK_MAP } from "@/lib/hook/hookMap";
import { HookBadge } from "@/components/hook/HookBadge";

// Title and description are inherited from the root layout; only the canonical is per-route.
export const metadata: Metadata = { alternates: { canonical: "/" } };

const DEMO_FEATURES = ["antiSnipe", "tax", "lock", "whitelist"] as const;

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Fair-launch on Uniswap v4 — in one transaction.</h1>
        <p className="max-w-2xl text-neutral-300">
          <code className="font-mono text-neutral-100">TokenLaunchHook</code> enforces anti-snipe,
          dynamic buy/sell tax, conditional liquidity lock, and an optional whitelist — without
          touching your ERC-20. This studio launches a campaign and shows you{" "}
          <strong>exactly which hook callback enforces each rule</strong>. It is a live demo of the hook.
        </p>
        <div className="flex gap-3">
          <Link href="/launch" className="btn-primary">
            Launch a campaign →
          </Link>
          <Link href="/governance" className="btn-ghost">
            Manage a launch
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What the hook does</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {DEMO_FEATURES.map((k) => {
            const f = HOOK_MAP[k];
            return (
              <div key={k} className="card space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{f.label}</span>
                  <HookBadge feature={k} />
                </div>
                <p className="text-sm text-neutral-400">{f.effect}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
