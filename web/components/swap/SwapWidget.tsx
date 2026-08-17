"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import type { Address, Hex } from "viem";

import { useCampaign } from "@/lib/campaign/useCampaign";
import { Erc20Abi, Permit2Abi, TokenLaunchHookAbi, UniversalRouterAbi } from "@/lib/config/abi";
import { CONTRACTS } from "@/lib/config/contracts.generated";
import { UNISWAP, PERMIT2 } from "@/lib/config/uniswap";
import { EXPLORER, type SupportedChainId } from "@/lib/config/chains";
import { formatAmount, taxUnitsToPercent, truncateAddress } from "@/lib/format";
import { quoteExactInputSingle } from "@/lib/swap/quote";
import { decodeRevertReason } from "@/lib/swap/revertReason";
import { buildUniversalRouterSwap } from "@/lib/swap/buildSwap";
import { track } from "@/lib/analytics";
import { Spinner } from "@/components/ui/Spinner";
import { TxStatus, type TxPhase } from "@/components/ui/TxStatus";
import {
  MAX_UINT160,
  MAX_UINT256,
  PERMIT2_EXPIRATION_SECS,
  isNative,
  planApprovals,
} from "@/lib/swap/permit2Swap";

const NATIVE = "0x0000000000000000000000000000000000000000" as const;
const SLIPPAGE_BPS_DEFAULT = 50; // 0.50%

function tokenMeta(currency: Address, reads: { symbol?: string; decimals?: number }) {
  if (isNative(currency)) return { symbol: "ETH", decimals: 18 };
  return { symbol: reads.symbol ?? "TOKEN", decimals: reads.decimals ?? 18 };
}

export function SwapWidget({ chainId, pid }: { chainId: SupportedChainId; pid: Hex }) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId });
  const { campaign, isLoading, error } = useCampaign(chainId, pid);
  const { writeContractAsync } = useWriteContract();

  const uni = UNISWAP[chainId];
  const hook = CONTRACTS[chainId].hook;

  const [isBuy, setIsBuy] = useState(true);
  const [amountStr, setAmountStr] = useState("");
  const [slippageBps] = useState(SLIPPAGE_BPS_DEFAULT);
  const [amountOut, setAmountOut] = useState<bigint | undefined>();
  const [quoteErr, setQuoteErr] = useState<string | undefined>();
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [actionErr, setActionErr] = useState<string | undefined>();
  const [phase, setPhase] = useState<TxPhase>();
  const [pendingHash, setPendingHash] = useState<Hex | undefined>();

  // ── Token metadata for both pool currencies ──
  const c0 = campaign?.poolKey.currency0;
  const c1 = campaign?.poolKey.currency1;
  const metaReads = useReadContracts({
    contracts:
      c0 && c1
        ? [
            { chainId, address: c0, abi: Erc20Abi, functionName: "symbol" },
            { chainId, address: c0, abi: Erc20Abi, functionName: "decimals" },
            { chainId, address: c1, abi: Erc20Abi, functionName: "symbol" },
            { chainId, address: c1, abi: Erc20Abi, functionName: "decimals" },
          ]
        : [],
    query: { enabled: Boolean(c0 && c1) },
  });
  const meta0 = { symbol: metaReads.data?.[0]?.result as string | undefined, decimals: metaReads.data?.[1]?.result as number | undefined };
  const meta1 = { symbol: metaReads.data?.[2]?.result as string | undefined, decimals: metaReads.data?.[3]?.result as number | undefined };

  const derived = useMemo(() => {
    if (!campaign?.initialized || !c0 || !c1) return undefined;
    const tokenCurrency = (campaign.tokenIsCurrency0 ? c0 : c1) as Address;
    const pairCurrency = (campaign.tokenIsCurrency0 ? c1 : c0) as Address;
    const inputCurrency = (isBuy ? pairCurrency : tokenCurrency) as Address;
    const outputCurrency = (isBuy ? tokenCurrency : pairCurrency) as Address;
    const inMeta = tokenMeta(inputCurrency, inputCurrency === c0 ? meta0 : meta1);
    const outMeta = tokenMeta(outputCurrency, outputCurrency === c0 ? meta0 : meta1);
    const zeroForOne = inputCurrency === c0;
    const tokenMetaInfo = tokenMeta(tokenCurrency, tokenCurrency === c0 ? meta0 : meta1);
    return { tokenCurrency, pairCurrency, inputCurrency, outputCurrency, inMeta, outMeta, zeroForOne, tokenMetaInfo };
  }, [campaign, c0, c1, isBuy, meta0.symbol, meta0.decimals, meta1.symbol, meta1.decimals]);

  const amountIn = useMemo(() => {
    if (!derived || !amountStr) return 0n;
    try {
      const [int, frac = ""] = amountStr.split(".");
      const d = derived.inMeta.decimals;
      const padded = (frac + "0".repeat(d)).slice(0, d);
      return BigInt(int || "0") * 10n ** BigInt(d) + BigInt(padded || "0");
    } catch {
      return 0n;
    }
  }, [amountStr, derived]);

  // ── Quote (debounced) ──
  useEffect(() => {
    if (!client || !derived || !uni.quoter || amountIn === 0n) {
      setAmountOut(undefined);
      setQuoteErr(undefined);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const out = await quoteExactInputSingle(client, {
          quoter: uni.quoter as Address,
          poolKey: campaign!.poolKey,
          zeroForOne: derived.zeroForOne,
          amountIn,
          account: address, // simulate as the connected trader so tx.origin checks (whitelist) pass
        });
        if (!cancelled) {
          setAmountOut(out);
          setQuoteErr(undefined);
        }
      } catch (e) {
        if (!cancelled) {
          setAmountOut(undefined);
          setQuoteErr(decodeRevertReason(e));
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [client, derived, uni.quoter, amountIn, campaign, address]);

  // ── Whitelist gating (tx.origin subject) ──
  const whitelistActive = Boolean(
    campaign?.enabled.whitelist && campaign && BigInt(Math.floor(Date.now() / 1000)) < campaign.whitelist.whitelistEndTime
  );
  const wlRead = useReadContract({
    chainId,
    address: hook,
    abi: TokenLaunchHookAbi,
    functionName: "isAddressWhitelisted",
    args: address && pid ? [pid, address] : undefined,
    query: { enabled: Boolean(whitelistActive && address) },
  });
  const isWhitelisted = wlRead.data as boolean | undefined;

  // ── Approvals for ERC-20 input ──
  const allowanceReads = useReadContracts({
    contracts:
      derived && address && !isNative(derived.inputCurrency)
        ? [
            { chainId, address: derived.inputCurrency, abi: Erc20Abi, functionName: "allowance", args: [address, PERMIT2] },
            { chainId, address: PERMIT2, abi: Permit2Abi, functionName: "allowance", args: [address, derived.inputCurrency, uni.universalRouter as Address] },
          ]
        : [],
    query: { enabled: Boolean(derived && address && uni.universalRouter && !isNative(derived.inputCurrency)) },
  });
  const erc20ToPermit2 = allowanceReads.data?.[0]?.result as bigint | undefined;
  const permit2ToRouter = allowanceReads.data?.[1]?.result as readonly [bigint, number, number] | undefined;

  const approvals = derived
    ? planApprovals({
        inputCurrency: derived.inputCurrency,
        amountIn,
        erc20AllowanceToPermit2: erc20ToPermit2,
        permit2AllowanceToRouter: permit2ToRouter?.[0],
        permit2ExpirationToRouter: permit2ToRouter?.[1],
        nowSec: Math.floor(Date.now() / 1000),
      })
    : { needsErc20Approve: false, needsPermit2Approve: false };

  // ── Disabled reason ──
  const antiSnipeCapHit = Boolean(
    derived &&
      isBuy &&
      campaign?.enabled.antiSnipe &&
      campaign &&
      BigInt(Math.floor(Date.now() / 1000)) < campaign.launchTime + BigInt(campaign.antiSnipe.antiSnipeDuration) &&
      amountIn > campaign.antiSnipe.maxBuyAmountIn
  );
  const disabledReason = !address
    ? "Connect a wallet"
    : amountIn === 0n
      ? "Enter an amount"
      : whitelistActive && isWhitelisted === false
        ? "Whitelist phase: this address isn't whitelisted (the swap is gated on tx.origin)."
        : antiSnipeCapHit
          ? `Anti-snipe: buy exceeds the per-tx cap (${formatAmount(campaign!.antiSnipe.maxBuyAmountIn, derived!.inMeta.decimals)} ${derived!.inMeta.symbol}).`
          : quoteErr
            ? quoteErr
            : !amountOut
              ? "No quote yet"
              : undefined;

  if (isLoading) return <div className="card text-sm text-neutral-400">Loading campaign…</div>;
  if (error || !campaign?.initialized)
    return <div className="card text-sm text-amber-300">No campaign found for this PoolId on this chain.</div>;
  if (!uni.universalRouter || !uni.quoter)
    return <div className="card text-sm text-amber-300">Swap periphery isn&apos;t configured for this chain.</div>;
  if (!derived) return null;

  const effTax = isBuy ? campaign.effectiveBuyTax : campaign.effectiveSellTax;
  const phaseLabel = ["Pre", "Active", "Frozen"][campaign.phase] ?? "?";

  // `kind` distinguishes the two approval writes from the swap itself — only the swap is a
  // conversion, an approval is plumbing.
  async function runWrite(fn: () => Promise<Hex>, kind: "approve" | "swap" = "approve") {
    setActionErr(undefined);
    setBusy(true);
    setPhase("confirm");
    try {
      const hash = await fn();
      setPendingHash(hash);
      setPhase("pending");
      await client?.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      if (kind === "swap") track("swap_execute", { chain_id: chainId, direction: isBuy ? "buy" : "sell" });
      await Promise.all([allowanceReads.refetch?.(), wlRead.refetch?.()]);
    } catch (e: unknown) {
      setActionErr(decodeRevertReason(e));
    } finally {
      setBusy(false);
      setPhase(undefined);
      setPendingHash(undefined);
    }
  }

  // Simulate first (eth_call) so a would-be revert is caught before the wallet sends a doomed tx; only
  // the request the simulation validated is broadcast.
  async function simulateAndWrite(params: Record<string, unknown>): Promise<Hex> {
    const { request } = await client!.simulateContract({ account: address, ...params } as never);
    return writeContractAsync(request as never);
  }

  const onApproveErc20 = () =>
    runWrite(() =>
      simulateAndWrite({
        chainId,
        address: derived.inputCurrency,
        abi: Erc20Abi,
        functionName: "approve",
        args: [PERMIT2, MAX_UINT256],
      })
    );

  const onApprovePermit2 = () =>
    runWrite(() =>
      simulateAndWrite({
        chainId,
        address: PERMIT2,
        abi: Permit2Abi,
        functionName: "approve",
        args: [
          derived.inputCurrency,
          uni.universalRouter as Address,
          MAX_UINT160,
          Math.floor(Date.now() / 1000) + PERMIT2_EXPIRATION_SECS,
        ],
      })
    );

  const onSwap = () => {
    if (!amountOut) return;
    const minOut = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
    const call = buildUniversalRouterSwap({
      poolKey: campaign.poolKey,
      zeroForOne: derived.zeroForOne,
      amountIn,
      amountOutMinimum: minOut,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20),
    });
    return runWrite(
      () =>
        simulateAndWrite({
          chainId,
          address: uni.universalRouter as Address,
          abi: UniversalRouterAbi,
          functionName: "execute",
          args: [call.commands, call.inputs, call.deadline],
          value: call.value,
        }),
      "swap"
    );
  };

  const primary =
    disabledReason && (disabledReason !== "No quote yet" || quoting)
      ? { label: disabledReason, onClick: undefined, disabled: true }
      : approvals.needsErc20Approve
        ? { label: `Approve ${derived.inMeta.symbol} for Permit2`, onClick: onApproveErc20, disabled: busy }
        : approvals.needsPermit2Approve
          ? { label: `Enable ${derived.inMeta.symbol} on Universal Router`, onClick: onApprovePermit2, disabled: busy }
          : { label: busy ? "Swapping…" : `Swap`, onClick: onSwap, disabled: busy || !amountOut };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>
          Phase: <span className="text-neutral-200">{phaseLabel}</span>
        </span>
        <span>
          {isBuy ? "Buy" : "Sell"} tax:{" "}
          <span className="text-neutral-200">{taxUnitsToPercent(effTax).toFixed(2)}%</span>
        </span>
      </div>

      <div className="flex gap-2">
        <button className={isBuy ? "btn-primary" : "btn-ghost"} onClick={() => setIsBuy(true)}>
          Buy {derived.tokenMetaInfo.symbol}
        </button>
        <button className={!isBuy ? "btn-primary" : "btn-ghost"} onClick={() => setIsBuy(false)}>
          Sell {derived.tokenMetaInfo.symbol}
        </button>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-neutral-400">You pay ({derived.inMeta.symbol})</label>
        <input
          value={amountStr}
          inputMode="decimal"
          onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-neutral-400">You receive ({derived.outMeta.symbol})</label>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-200">
          {quoting ? "…" : amountOut != null ? formatAmount(amountOut, derived.outMeta.decimals) : "—"}
        </div>
        <p className="text-[11px] text-neutral-500">Slippage {slippageBps / 100}% · quote via V4Quoter</p>
      </div>

      <button className="btn-primary flex w-full items-center justify-center gap-2" disabled={primary.disabled} onClick={primary.onClick}>
        {busy && <Spinner className="h-4 w-4" />}
        {primary.label}
      </button>

      {phase && <TxStatus phase={phase} hash={pendingHash} chainId={chainId} />}
      {actionErr && <p className="text-xs text-red-400">{actionErr}</p>}
      {txHash && (
        <a
          className="block text-xs text-emerald-400 underline"
          href={`${EXPLORER[chainId]}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
        >
          Last tx: {truncateAddress(txHash, 10, 8)} ↗
        </a>
      )}
    </div>
  );
}
