"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { truncateAddress } from "@/lib/format";

/**
 * Injected-only connect control (MetaMask / Rabby via EIP-6963). No WalletConnect. A single
 * "Connect wallet" button opens a dropdown of every discovered injected wallet, so multiple
 * extensions don't each render their own button. Connected state shows the address + disconnect.
 */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected) {
    return (
      <button className="btn-ghost" onClick={() => disconnect()}>
        {truncateAddress(address)} · Disconnect
      </button>
    );
  }

  // De-dupe discovered injected providers by name (EIP-6963 can surface duplicates).
  const seen = new Set<string>();
  const options = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  if (options.length === 0) {
    return <span className="text-xs text-neutral-400">No wallet — install MetaMask / Rabby</span>;
  }

  return (
    <div className="relative">
      <button className="btn-primary" disabled={isPending} onClick={() => setOpen((v) => !v)}>
        {isPending ? "Connecting…" : "Connect wallet"} <span className="text-white/70">▾</span>
      </button>

      {open && (
        <>
          {/* click-outside backdrop */}
          <button className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
            {options.map((c) => {
              const icon = (c as { icon?: string }).icon;
              return (
                <button
                  key={c.uid}
                  disabled={isPending}
                  onClick={() => {
                    connect({ connector: c });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-neutral-900 disabled:opacity-50"
                >
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="" width={18} height={18} className="shrink-0 rounded" />
                  ) : (
                    <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-neutral-700 text-[10px] font-bold">
                      {c.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="flex-1">{c.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
