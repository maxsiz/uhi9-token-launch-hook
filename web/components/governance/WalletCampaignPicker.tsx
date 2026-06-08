"use client";

import { useAccount } from "wagmi";
import { useWalletCampaigns } from "@/lib/campaign/useWalletCampaigns";
import type { CampaignView } from "@/lib/campaign/useCampaign";
import { useErc20Meta } from "@/lib/useErc20Meta";
import { type SupportedChainId } from "@/lib/config/chains";
import { truncateAddress } from "@/lib/format";

const PHASES = ["Pre", "Active", "Frozen"];

/** One campaign button — resolves the launch token's name/symbol for a human label. */
function CampaignButton({
  chainId,
  c,
  selected,
  onSelect,
  walletAddress,
}: {
  chainId: SupportedChainId;
  c: CampaignView;
  selected?: string;
  onSelect: (pid: string) => void;
  walletAddress?: string;
}) {
  const token = c.tokenIsCurrency0 ? c.poolKey.currency0 : c.poolKey.currency1;
  const meta = useErc20Meta(chainId, token);
  const mine = walletAddress && c.governanceOwner.toLowerCase() === walletAddress.toLowerCase();
  const isSel = selected?.toLowerCase() === c.pid.toLowerCase();
  const label = meta.symbol ? `${meta.name ? meta.name + " " : ""}(${meta.symbol})` : meta.isLoading ? "…" : truncateAddress(token);

  return (
    <button
      onClick={() => onSelect(c.pid)}
      className={`card text-left text-sm transition ${isSel ? "border-blue-600" : "hover:border-neutral-600"}`}
    >
      <div className="truncate font-medium">{label}</div>
      <div className="text-xs text-neutral-400">
        {PHASES[c.phase] ?? "?"} · <span className="font-mono">{truncateAddress(c.pid, 8, 6)}</span>
        {mine && <span className="text-emerald-400"> · you</span>}
      </div>
    </button>
  );
}

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
        {campaigns.map((c) => (
          <CampaignButton key={c.pid} chainId={chainId} c={c} selected={selected} onSelect={onSelect} walletAddress={address} />
        ))}
      </div>
    </div>
  );
}
