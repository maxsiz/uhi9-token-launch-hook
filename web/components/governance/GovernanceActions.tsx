"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Address, Hex } from "viem";

import { useCampaign } from "@/lib/campaign/useCampaign";
import { TokenLaunchHookAbi } from "@/lib/config/abi";
import { EXPLORER, type SupportedChainId } from "@/lib/config/chains";
import { percentToTaxUnits, taxUnitsToPercent, truncateAddress } from "@/lib/format";

function toUnix(local: string): bigint {
  return BigInt(Math.floor(new Date(local).getTime() / 1000));
}

/**
 * Governance write actions, gated to the gov-NFT owner during the Active phase (onlyGovernance reverts
 * otherwise). Only the panels for enabled modules render. All mutations are one-way relaxations.
 */
export function GovernanceActions({ chainId, pid, hook }: { chainId: SupportedChainId; pid: Hex; hook: Address }) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId });
  const { campaign, refetch } = useCampaign(chainId, pid);
  const { writeContractAsync } = useWriteContract();

  const [busy, setBusy] = useState<string | undefined>();
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [err, setErr] = useState<string | undefined>();

  // local form state
  const [buyTax, setBuyTax] = useState("");
  const [sellTax, setSellTax] = useState("");
  const [wlAddr, setWlAddr] = useState("");
  const [wlEnd, setWlEnd] = useState("");
  const [unlockAt, setUnlockAt] = useState("");

  if (!campaign?.initialized) return null;

  const isOwner = address && campaign.governanceOwner.toLowerCase() === address.toLowerCase();
  const active = campaign.phase === 1;

  if (!isOwner)
    return (
      <p className="text-xs text-neutral-500">
        Only the governance-NFT owner ({truncateAddress(campaign.governanceOwner)}) can edit, during the Active phase.
      </p>
    );
  if (!active)
    return <p className="text-xs text-amber-400">Governance is frozen for this campaign (launch window ended).</p>;

  async function run(key: string, fn: () => Promise<Hex>) {
    setErr(undefined);
    setBusy(key);
    try {
      const hash = await fn();
      await client?.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      await refetch?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : "Transaction failed");
    } finally {
      setBusy(undefined);
    }
  }

  const write = (fn: string, args: readonly unknown[]) =>
    writeContractAsync({ chainId, address: hook, abi: TokenLaunchHookAbi, functionName: fn, args } as never);

  const en = campaign.enabled;

  return (
    <div className="space-y-4">
      {en.tax && (
        <div className="card space-y-2">
          <h4 className="text-sm font-semibold">Tax — ratchet down</h4>
          <p className="text-xs text-neutral-500">
            Current effective {taxUnitsToPercent(campaign.effectiveBuyTax).toFixed(2)}% buy /{" "}
            {taxUnitsToPercent(campaign.effectiveSellTax).toFixed(2)}% sell. Overrides may only lower the tax.
          </p>
          <div className="flex gap-2">
            <input value={buyTax} onChange={(e) => setBuyTax(e.target.value)} placeholder="new buy %" className="input flex-1" />
            <button
              className="btn-ghost"
              disabled={busy === "buyTax" || !buyTax}
              onClick={() => run("buyTax", () => write("setBuyTaxOverride", [pid, percentToTaxUnits(Number(buyTax))]))}
            >
              Set buy
            </button>
          </div>
          <div className="flex gap-2">
            <input value={sellTax} onChange={(e) => setSellTax(e.target.value)} placeholder="new sell %" className="input flex-1" />
            <button
              className="btn-ghost"
              disabled={busy === "sellTax" || !sellTax}
              onClick={() => run("sellTax", () => write("setSellTaxOverride", [pid, percentToTaxUnits(Number(sellTax))]))}
            >
              Set sell
            </button>
          </div>
        </div>
      )}

      {en.whitelist && (
        <div className="card space-y-2">
          <h4 className="text-sm font-semibold">Whitelist</h4>
          <p className="text-xs text-neutral-500">
            Window until {new Date(Number(campaign.whitelist.whitelistEndTime) * 1000).toLocaleString()}.
          </p>
          <div className="flex gap-2">
            <input value={wlAddr} onChange={(e) => setWlAddr(e.target.value)} placeholder="0x address" className="input flex-1 font-mono" />
            <button
              className="btn-ghost"
              disabled={busy === "wlAdd" || !/^0x[0-9a-fA-F]{40}$/.test(wlAddr)}
              onClick={() => run("wlAdd", () => write("addToWhitelist", [pid, wlAddr as Address]))}
            >
              Add
            </button>
            <button
              className="btn-ghost"
              disabled={busy === "wlRem" || !/^0x[0-9a-fA-F]{40}$/.test(wlAddr)}
              onClick={() => run("wlRem", () => write("removeFromWhitelist", [pid, wlAddr as Address]))}
            >
              Remove
            </button>
          </div>
          <div className="flex gap-2">
            <input type="datetime-local" value={wlEnd} onChange={(e) => setWlEnd(e.target.value)} className="input flex-1" />
            <button
              className="btn-ghost"
              disabled={busy === "wlEnd" || !wlEnd}
              onClick={() => run("wlEnd", () => write("relaxWhitelistEndTime", [pid, toUnix(wlEnd)]))}
            >
              Shorten window
            </button>
          </div>
        </div>
      )}

      {en.lock && (
        <div className="card space-y-2">
          <h4 className="text-sm font-semibold">Liquidity lock — relax only</h4>
          <div className="flex gap-2">
            <input type="datetime-local" value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)} className="input flex-1" />
            <button
              className="btn-ghost"
              disabled={busy === "unlock" || !unlockAt}
              onClick={() => run("unlock", () => write("relaxUnlockTime", [pid, toUnix(unlockAt)]))}
            >
              Earlier unlock
            </button>
          </div>
          <button className="btn-ghost" disabled={busy === "or"} onClick={() => run("or", () => write("switchToOr", [pid]))}>
            Switch lock logic to OR
          </button>
        </div>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}
      {txHash && (
        <a className="block text-xs text-emerald-400 underline" href={`${EXPLORER[chainId]}/tx/${txHash}`} target="_blank" rel="noreferrer">
          Last tx: {truncateAddress(txHash, 10, 8)} ↗
        </a>
      )}
    </div>
  );
}
