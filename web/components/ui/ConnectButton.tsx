"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { truncateAddress } from "@/lib/format";

/**
 * Minimal injected-only connect button (MetaMask / Rabby via EIP-6963). No WalletConnect.
 * Lists every discovered injected connector; connected state shows the address + disconnect.
 */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <button className="btn-ghost" onClick={() => disconnect()}>
        {truncateAddress(address)} · Disconnect
      </button>
    );
  }

  // Prefer concrete EIP-6963 / injected providers; de-dupe by name.
  const seen = new Set<string>();
  const options = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  if (options.length === 0) {
    return <p className="text-sm text-neutral-400">No injected wallet found. Install MetaMask or Rabby.</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {options.map((c) => (
        <button key={c.uid} className="btn-primary" disabled={isPending} onClick={() => connect({ connector: c })}>
          Connect {c.name}
        </button>
      ))}
    </div>
  );
}
