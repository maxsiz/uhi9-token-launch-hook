"use client";

import { useState } from "react";
import Link from "next/link";
import { useChainId } from "wagmi";
import type { Hex } from "viem";
import { CONTRACTS, isDeployed } from "@/lib/config/contracts.generated";
import { isSupportedChain } from "@/lib/config/chains";
import { HookActivityPanel } from "@/components/hook/HookActivityPanel";
import { CampaignSummary } from "@/components/governance/CampaignSummary";
import { GovernanceActions } from "@/components/governance/GovernanceActions";
import { WalletCampaignPicker } from "@/components/governance/WalletCampaignPicker";

export function GovernanceDashboard() {
  const chainId = useChainId();
  const [pid, setPid] = useState<string>("");
  const valid = /^0x[0-9a-fA-F]{64}$/.test(pid);
  const deployed = isSupportedChain(chainId) && isDeployed(chainId);
  const hook = isSupportedChain(chainId) ? CONTRACTS[chainId].hook : undefined;

  return (
    <div className="space-y-6">
      {!deployed && (
        <div className="card border-amber-900/50 text-sm text-amber-300">
          The stack isn&apos;t deployed on this chain yet (run <code className="font-mono">DeployStack.s.sol</code>{" "}
          then <code className="font-mono">npm run gen:contracts</code>).
        </div>
      )}

      {deployed && isSupportedChain(chainId) && (
        <WalletCampaignPicker chainId={chainId} selected={pid} onSelect={setPid} />
      )}

      <div className="card space-y-2">
        <label className="text-sm font-medium">Pool ID</label>
        <input
          value={pid}
          onChange={(e) => setPid(e.target.value.trim())}
          placeholder="0x… (32-byte PoolId from the launch event)"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm"
        />
        <p className="text-xs text-neutral-500">
          Paste the PoolId emitted by <code className="font-mono">CampaignLaunched</code>, or derive it from the
          PoolKey (<code className="font-mono">lib/campaign/poolId.ts</code>).
        </p>
      </div>

      {valid && hook && isSupportedChain(chainId) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <CampaignSummary chainId={chainId} pid={pid as Hex} />
            <HookActivityPanel hook={hook} pid={pid as Hex} />
            <Link href={`/swap/${chainId}/${pid}`} className="btn-primary inline-block">
              Trade this pool →
            </Link>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Governance actions</h3>
            <p className="text-xs text-neutral-500">
              Available to the governance-NFT owner during the Active phase. Each action is badged with the hook
              callback it influences.
            </p>
            <GovernanceActions chainId={chainId} pid={pid as Hex} hook={hook} />
          </div>
        </div>
      )}
    </div>
  );
}
