"use client";

import { useState } from "react";
import { useChainId, useSwitchChain } from "wagmi";

import { SUPPORTED_CHAINS, isSupportedChain } from "@/lib/config/chains";
import { isDeployed } from "@/lib/config/contracts.generated";
import { chainColor, chainLogo, chainShort } from "@/lib/config/chainMeta";

/** Chain brand mark; falls back to a colored circle with initials if the SVG is missing. */
function ChainIcon({ id, size = 18 }: { id: number; size?: number }) {
  const [broken, setBroken] = useState(false);
  const logo = chainLogo(id);
  if (!logo || broken) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
        style={{ width: size, height: size, background: chainColor(id) }}
      >
        {chainShort(id).slice(0, 2)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt="" width={size} height={size} className="shrink-0 rounded-full" onError={() => setBroken(true)} />;
}

/**
 * Header network selector. Lists every supported chain; chains with the stack deployed are marked
 * "live", the rest are dimmed "not deployed" but still switchable (switching is a wallet action,
 * independent of deploy status). Uses wagmi `useSwitchChain`.
 */
export function NetworkSelector() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const supported = isSupportedChain(chainId);
  const active = SUPPORTED_CHAINS.find((c) => c.id === chainId);

  return (
    <div className="relative">
      <button className="btn-ghost flex items-center gap-2" onClick={() => setOpen((v) => !v)}>
        {supported && <ChainIcon id={chainId} />}
        <span className={supported ? "" : "text-amber-400"}>{active?.name ?? "Unsupported"}</span>
        <span className="text-neutral-500">▾</span>
      </button>

      {open && (
        <>
          {/* click-outside backdrop */}
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
            {SUPPORTED_CHAINS.map((c) => {
              const live = isDeployed(c.id);
              const isActive = c.id === chainId;
              return (
                <button
                  key={c.id}
                  disabled={isPending}
                  onClick={() => {
                    switchChain({ chainId: c.id });
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-neutral-900 disabled:opacity-50 ${isActive ? "bg-neutral-900" : ""}`}
                >
                  <ChainIcon id={c.id} />
                  <span className={`flex-1 ${live ? "" : "text-neutral-500"}`}>{c.name}</span>
                  {live ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      live
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-600">not deployed</span>
                  )}
                  {isActive && <span className="text-blue-400">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
