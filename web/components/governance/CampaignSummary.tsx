"use client";

import { useAccount } from "wagmi";
import type { Hex } from "viem";

import { useCampaign } from "@/lib/campaign/useCampaign";
import { type SupportedChainId } from "@/lib/config/chains";
import { formatAmount, taxUnitsToPercent, truncateAddress } from "@/lib/format";

const PHASES = ["Pre-launch", "Active", "Frozen"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono text-neutral-200">{children}</span>
    </div>
  );
}

/** One-call campaign snapshot via CampaignLens.getCampaign. */
export function CampaignSummary({ chainId, pid }: { chainId: SupportedChainId; pid: Hex }) {
  const { address } = useAccount();
  const { campaign, isLoading, error } = useCampaign(chainId, pid);

  if (isLoading) return <div className="card text-sm text-neutral-400">Loading campaign…</div>;
  if (error || !campaign?.initialized)
    return <div className="card text-sm text-amber-300">No campaign found for this PoolId.</div>;

  const isOwner = address && campaign.governanceOwner.toLowerCase() === address.toLowerCase();
  const en = campaign.enabled;
  const enabledList =
    [en.antiSnipe && "anti-snipe", en.tax && "tax", en.lock && "lock", en.whitelist && "whitelist"]
      .filter(Boolean)
      .join(", ") || "none";
  const endDate = new Date(Number(campaign.launchEndTime) * 1000);

  return (
    <div className="card space-y-2">
      <h3 className="text-sm font-semibold">Campaign (via CampaignLens)</h3>
      <Row label="Phase">{PHASES[campaign.phase] ?? "?"}</Row>
      <Row label="Launch token">
        {truncateAddress(campaign.tokenIsCurrency0 ? campaign.poolKey.currency0 : campaign.poolKey.currency1)}
      </Row>
      <Row label="Pair">
        {truncateAddress(campaign.tokenIsCurrency0 ? campaign.poolKey.currency1 : campaign.poolKey.currency0)}
      </Row>
      <Row label="Gov NFT owner">
        {truncateAddress(campaign.governanceOwner)}
        {isOwner && <span className="ml-1 text-emerald-400">(you)</span>}
      </Row>
      <Row label="Modules">{enabledList}</Row>
      {en.tax && (
        <Row label="Tax buy / sell">
          {taxUnitsToPercent(campaign.effectiveBuyTax).toFixed(2)}% / {taxUnitsToPercent(campaign.effectiveSellTax).toFixed(2)}%
        </Row>
      )}
      {en.whitelist && <Row label="Whitelist until">{new Date(Number(campaign.whitelist.whitelistEndTime) * 1000).toLocaleString()}</Row>}
      {en.lock && (
        <Row label="Lock">
          {campaign.lockUnlocked ? "unlocked" : "locked"} · vol {formatAmount(campaign.cumulativeVolume, 18, 2)}
        </Row>
      )}
      <Row label="Governance ends">{endDate.toLocaleString()}</Row>
    </div>
  );
}
