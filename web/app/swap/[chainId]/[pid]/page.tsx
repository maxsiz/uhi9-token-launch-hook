import Link from "next/link";
import { ConnectGate } from "@/components/ConnectGate";
import { SwapWidget } from "@/components/swap/SwapWidget";
import { isSupportedChain, type SupportedChainId } from "@/lib/config/chains";

import type { Metadata } from "next";

// An unbounded, per-campaign URL space (`/swap/<chainId>/<poolId>`) whose content only exists once a
// wallet is connected: nothing worth indexing, and thousands of near-identical thin pages if it were.
// It is left crawlable in robots.txt on purpose — a disallowed URL can never be read, and this
// noindex is exactly what we need Google to read.
export const metadata: Metadata = {
  title: "Trade a campaign pool",
  robots: { index: false, follow: true },
};

/**
 * Per-campaign swap page with a shareable URL: /swap/<chainId>/<pid>. A fallback Uniswap-style widget
 * for trading a launched pool when the custom-hook pool isn't available in the stock Uniswap UI.
 */
export default function SwapPage({ params }: { params: { chainId: string; pid: string } }) {
  const chainId = Number(params.chainId);
  const pid = params.pid;
  const validChain = isSupportedChain(chainId);
  const validPid = /^0x[0-9a-fA-F]{64}$/.test(pid);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Trade</h1>
        <p className="text-xs text-neutral-500">
          Campaign pool on chain {params.chainId}. Trades route through the Uniswap v4 Universal Router and
          respect the hook&apos;s rules (whitelist phase, anti-snipe cap, tax).
        </p>
      </div>

      {!validChain || !validPid ? (
        <div className="card text-sm text-amber-300">
          Invalid swap link. Expected <code className="font-mono">/swap/&lt;chainId&gt;/&lt;poolId&gt;</code> with a
          supported chain and a 32-byte PoolId.
        </div>
      ) : (
        <ConnectGate>
          <SwapWidget chainId={chainId as SupportedChainId} pid={pid as `0x${string}`} />
        </ConnectGate>
      )}

      <Link href="/governance" className="block text-xs text-neutral-500 underline">
        ← Governance dashboard
      </Link>
    </div>
  );
}
