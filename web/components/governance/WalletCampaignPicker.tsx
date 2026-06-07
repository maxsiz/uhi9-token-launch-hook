"use client";

import { useAccount } from "wagmi";
import { useWalletCampaigns } from "@/lib/campaign/useWalletCampaigns";
import { type SupportedChainId } from "@/lib/config/chains";
import { truncateAddress } from "@/lib/format";

const PHASES = ["Pre", "Active", "Frozen"];

/** Lets the connected wallet pick one of its discovered campaigns instead of pasting a PoolId. */
export function WalletCampaignPicker({
  chainId,
  selected,
  onSelect,
}: {
  chainId: SupportedChainId;
  selected?: string;
  onSelect: (pid: string) => void;
}) {
  const { address } = useAccount();
  const { campaigns, isLoading } = useWalletCampaigns(chainId);

  if (isLoading) return <div className="card text-sm text-neutral-400">Scanning your positions…</div>;
  if (campaigns.length === 0) return null;

  return (
    <div className="card space-y-2">
      <h3 className="text-sm font-semibold">Your campaigns</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {campaigns.map((c) => {
          const token = c.tokenIsCurrency0 ? c.poolKey.currency0 : c.poolKey.currency1;
          const mine = address && c.governanceOwner.toLowerCase() === address.toLowerCase();
          const isSel = selected?.toLowerCase() === c.pid.toLowerCase();
          return (
            <button
              key={c.pid}
              onClick={() => onSelect(c.pid)}
              className={`card text-left text-sm transition ${isSel ? "border-blue-600" : "hover:border-neutral-600"}`}
            >
              <div className="font-mono">{truncateAddress(c.pid, 10, 6)}</div>
              <div className="text-xs text-neutral-400">
                {PHASES[c.phase] ?? "?"} · token {truncateAddress(token)}
                {mine && <span className="text-emerald-400"> · you</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
