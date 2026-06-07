"use client";

import { useAccount } from "wagmi";
import type { Address, Hex } from "viem";

import { useCampaign } from "@/lib/campaign/useCampaign";
import { EXPLORER, type SupportedChainId } from "@/lib/config/chains";
import { useErc20Meta } from "@/lib/useErc20Meta";
import { formatAmount, formatUtc, taxUnitsToPercent, truncateAddress } from "@/lib/format";

const PHASES = ["Pre-launch", "Active", "Frozen"];
const ZERO = "0x0000000000000000000000000000000000000000";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono text-neutral-200">{children}</span>
    </div>
  );
}

/** Truncated address linked to the chain's block explorer. */
function AddrLink({ chainId, address, children }: { chainId: SupportedChainId; address: string; children?: React.ReactNode }) {
  return (
    <a href={`${EXPLORER[chainId]}/address/${address}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
      {children ?? truncateAddress(address)}
    </a>
  );
}

/** Token name/symbol (auto-resolved) + its address as an explorer link. Native ETH shows no link. */
function TokenCell({ chainId, address }: { chainId: SupportedChainId; address: Address }) {
  const native = address.toLowerCase() === ZERO;
  const meta = useErc20Meta(chainId, native ? undefined : address);
  if (native) return <span>ETH <span className="text-neutral-500">native</span></span>;
  const label = meta.symbol ? `${meta.symbol}${meta.name ? ` · ${meta.name}` : ""}` : meta.isLoading ? "…" : "token";
  return (
    <span>
      {label} <AddrLink chainId={chainId} address={address} />
    </span>
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

  return (
    <div className="card space-y-2">
      <h3 className="text-sm font-semibold">Campaign (via CampaignLens)</h3>
      <Row label="Phase">{PHASES[campaign.phase] ?? "?"}</Row>
      <Row label="Launch token">
        <TokenCell chainId={chainId} address={campaign.tokenIsCurrency0 ? campaign.poolKey.currency0 : campaign.poolKey.currency1} />
      </Row>
      <Row label="Pair">
        <TokenCell chainId={chainId} address={campaign.tokenIsCurrency0 ? campaign.poolKey.currency1 : campaign.poolKey.currency0} />
      </Row>
      <Row label="Gov NFT owner">
        <AddrLink chainId={chainId} address={campaign.governanceOwner} />
        {isOwner && <span className="ml-1 text-emerald-400">(you)</span>}
      </Row>
      <Row label="Modules">{enabledList}</Row>
      {en.tax && (
        <Row label="Tax buy / sell">
          {taxUnitsToPercent(campaign.effectiveBuyTax).toFixed(2)}% / {taxUnitsToPercent(campaign.effectiveSellTax).toFixed(2)}%
        </Row>
      )}
      {en.whitelist && <Row label="Whitelist until">{formatUtc(campaign.whitelist.whitelistEndTime)}</Row>}
      {en.lock && (
        <Row label="Lock">
          {campaign.lockUnlocked ? "unlocked" : "locked"} · vol {formatAmount(campaign.cumulativeVolume, 18, 2)}
        </Row>
      )}
      <Row label="Governance ends">{formatUtc(campaign.launchEndTime)}</Row>
    </div>
  );
}
