"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import { parseUnits, type Address } from "viem";

import { PRESETS, type PresetId } from "@/lib/campaign/presets";
import { UnlockLogic, type EnabledMechanisms } from "@/lib/campaign/types";
import { hookPlan } from "@/lib/hook/hookMap";
import { HookExplainer } from "@/components/hook/HookExplainer";
import { HookBadge } from "@/components/hook/HookBadge";
import { isSupportedChain, EXPLORER, type SupportedChainId } from "@/lib/config/chains";
import { prepareLaunch, type LaunchFormInput, type ModuleConfigInput } from "@/lib/campaign/launch";
import { useLaunch, type WizardForm } from "@/lib/campaign/useLaunch";
import { formatAmount, truncateAddress } from "@/lib/format";

const num = (e: { target: { value: string } }) => e.target.value.replace(/[^0-9]/g, "");
const dec = (e: { target: { value: string } }) => e.target.value.replace(/[^0-9.]/g, "");

const STEPS = ["Token", "Pool & price", "Mechanisms", "Review", "Sign"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;
const FEATURES: (keyof EnabledMechanisms)[] = ["antiSnipe", "tax", "lock", "whitelist"];
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export function LaunchWizard() {
  const chainId = useChainId();
  const { address } = useAccount();
  const supported = isSupportedChain(chainId);

  const [step, setStep] = useState<StepIndex>(0);
  const [presetId, setPresetId] = useState<PresetId>("custom");
  const [enabled, setEnabled] = useState<EnabledMechanisms>({ antiSnipe: false, tax: false, lock: false, whitelist: false });

  // form state
  const [tokenMode, setTokenMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("Demo Token");
  const [symbol, setSymbol] = useState("DEMO");
  const [supplyStr, setSupplyStr] = useState("1000000");
  const [existingToken, setExistingToken] = useState("");
  const [existingDecimals, setExistingDecimals] = useState("18");
  const [pairMode, setPairMode] = useState<"native" | "erc20">("native");
  const [pairAddress, setPairAddress] = useState("");
  const [pairDecimals, setPairDecimals] = useState("6");
  const [seedToken, setSeedToken] = useState("100000");
  const [seedPair, setSeedPair] = useState("0.05");
  const [durationDays, setDurationDays] = useState("1");

  // module config state (human units)
  const [asDuration, setAsDuration] = useState("60"); // minutes
  const [asMaxBuy, setAsMaxBuy] = useState("1"); // pair units
  const [taxBuy, setTaxBuy] = useState("3");
  const [taxSell, setTaxSell] = useState("5");
  const [taxBase, setTaxBase] = useState("0.3");
  const [taxDecay, setTaxDecay] = useState("7"); // days
  const [lockLogic, setLockLogic] = useState<"AND" | "OR">("AND");
  const [lockTime, setLockTime] = useState(true);
  const [lockDelay, setLockDelay] = useState("1"); // days after launch ends
  const [lockVolume, setLockVolume] = useState(false);
  const [lockVolThreshold, setLockVolThreshold] = useState("0");
  const [wlWindow, setWlWindow] = useState("30"); // minutes

  const pairSym = pairMode === "native" ? "ETH" : "pair";
  const modules: ModuleConfigInput = useMemo(
    () => ({
      antiSnipe: { durationMinutes: Number(asDuration) || 0, maxBuyHuman: asMaxBuy },
      tax: { initialBuyPct: Number(taxBuy) || 0, initialSellPct: Number(taxSell) || 0, basePct: Number(taxBase) || 0, decayDays: Number(taxDecay) || 0 },
      lock: {
        logic: lockLogic === "OR" ? UnlockLogic.OR : UnlockLogic.AND,
        timeEnabled: lockTime,
        unlockDelayDays: Number(lockDelay) || 0,
        volumeEnabled: lockVolume,
        volumeThresholdHuman: lockVolThreshold,
      },
    }),
    [asDuration, asMaxBuy, taxBuy, taxSell, taxBase, taxDecay, lockLogic, lockTime, lockDelay, lockVolume, lockVolThreshold]
  );
  const whitelistWindowMinutes = Number(wlWindow) || 30;

  const plan = useMemo(() => hookPlan(enabled), [enabled]);
  const { run, stage, error, result } = useLaunch((supported ? chainId : 1301) as SupportedChainId);

  function choosePreset(id: PresetId) {
    setPresetId(id);
    setEnabled(PRESETS.find((x) => x.id === id)!.enabled);
  }
  function toggle(k: keyof EnabledMechanisms) {
    setPresetId("custom");
    setEnabled((e) => ({ ...e, [k]: !e[k] }));
  }

  const form: WizardForm = {
    tokenMode,
    name,
    symbol,
    totalSupply: (() => {
      try {
        return parseUnits(supplyStr || "0", 18);
      } catch {
        return 0n;
      }
    })(),
    existingToken: (existingToken || ZERO) as Address,
    existingTokenDecimals: Number(existingDecimals) || 18,
    pairMode,
    pairAddress: (pairAddress || ZERO) as Address,
    pairDecimals: Number(pairDecimals) || 18,
    seedToken,
    seedPair,
    durationDays: Number(durationDays) || 1,
    enabled,
    modules,
    whitelistWindowMinutes,
  };

  // Best-effort preview (orientation for a fresh ERC-20-paired token is only exact post-deploy).
  const preview = useMemo(() => {
    try {
      const input: LaunchFormInput = {
        newToken: tokenMode === "new" ? { name, symbol, totalSupply: form.totalSupply } : undefined,
        existingToken: tokenMode === "existing" ? (existingToken as Address) : undefined,
        tokenAddress: tokenMode === "existing" ? (existingToken as Address) : undefined,
        tokenDecimals: tokenMode === "existing" ? Number(existingDecimals) || 18 : 18,
        pair: pairMode === "native" ? { native: true } : { address: pairAddress as Address, decimals: Number(pairDecimals) || 18 },
        seedTokenHuman: seedToken,
        seedPairHuman: seedPair,
        launchDurationDays: Number(durationDays) || 1,
        tickSpacing: 60,
        staticFee: 3000,
        rangeTicks: 6000,
        slippageBps: 50,
        lpRecipient: (address ?? ZERO) as Address,
        enabled,
        modules,
        whitelistWindowMinutes,
      };
      return prepareLaunch(input, Math.floor(Date.now() / 1000));
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenMode, name, symbol, form.totalSupply, existingToken, existingDecimals, pairMode, pairAddress, pairDecimals, seedToken, seedPair, durationDays, address, enabled, modules, whitelistWindowMinutes]);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className={`rounded-full px-3 py-1 ${i === step ? "bg-blue-600 text-white" : i < step ? "bg-neutral-800 text-neutral-300" : "bg-neutral-900 text-neutral-500"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Token</h3>
            <HookBadge feature="launch.bootstrap" />
          </div>
          <div className="flex gap-2 text-sm">
            <button className={tokenMode === "new" ? "btn-primary" : "btn-ghost"} onClick={() => setTokenMode("new")}>Deploy new</button>
            <button className={tokenMode === "existing" ? "btn-primary" : "btn-ghost"} onClick={() => setTokenMode("existing")}>Existing token</button>
          </div>
          {tokenMode === "new" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
              <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" />
              <input className="input" value={supplyStr} onChange={(e) => setSupplyStr(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Total supply" />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input font-mono" value={existingToken} onChange={(e) => setExistingToken(e.target.value.trim())} placeholder="0x token address" />
              <input className="input" value={existingDecimals} onChange={(e) => setExistingDecimals(e.target.value)} placeholder="decimals" />
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Pool &amp; price</h3>
            <HookBadge feature="launch.bootstrap" />
          </div>
          <div className="flex gap-2 text-sm">
            <button className={pairMode === "native" ? "btn-primary" : "btn-ghost"} onClick={() => setPairMode("native")}>Native ETH</button>
            <button className={pairMode === "erc20" ? "btn-primary" : "btn-ghost"} onClick={() => setPairMode("erc20")}>ERC-20</button>
          </div>
          {pairMode === "erc20" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input font-mono" value={pairAddress} onChange={(e) => setPairAddress(e.target.value.trim())} placeholder="0x pair token (e.g. USDC)" />
              <input className="input" value={pairDecimals} onChange={(e) => setPairDecimals(e.target.value)} placeholder="pair decimals" />
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1"><span className="text-xs text-neutral-400">Seed token amount</span><input className="input" value={seedToken} onChange={(e) => setSeedToken(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
            <label className="space-y-1"><span className="text-xs text-neutral-400">Seed pair amount ({pairMode === "native" ? "ETH" : "pair"})</span><input className="input" value={seedPair} onChange={(e) => setSeedPair(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
          </div>
          <label className="space-y-1 block"><span className="text-xs text-neutral-400">Launch duration (days, ≥ 1)</span><input className="input" value={durationDays} onChange={(e) => setDurationDays(e.target.value.replace(/[^0-9]/g, ""))} /></label>
          <p className="text-xs text-neutral-500">Initial price ≈ {Number(seedPair) / Math.max(Number(seedToken), 1e-9)} pair per token (set by the seed ratio).</p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="font-semibold">Choose a preset</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => choosePreset(p.id)} className={`card text-left transition ${presetId === p.id ? "border-blue-600" : "hover:border-neutral-600"}`}>
                  <div className="font-medium">{p.label}</div>
                  <div className="text-sm text-neutral-400">{p.description}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Mechanisms</h3>
            {FEATURES.map((k) => (
              <div key={k} className="space-y-3 rounded-lg border border-neutral-800 p-3">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={enabled[k]} onChange={() => toggle(k)} />
                  <span className="flex-1 capitalize">{k}</span>
                  <HookBadge feature={k} />
                </label>

                {enabled.antiSnipe && k === "antiSnipe" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Window (min, ≤ 1440)"><input className="input" value={asDuration} onChange={(e) => setAsDuration(num(e))} /></Field>
                    <Field label={`Max buy / tx (${pairSym})`}><input className="input" value={asMaxBuy} onChange={(e) => setAsMaxBuy(dec(e))} /></Field>
                  </div>
                )}

                {enabled.tax && k === "tax" && (
                  <>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Field label="Buy %"><input className="input" value={taxBuy} onChange={(e) => setTaxBuy(dec(e))} /></Field>
                      <Field label="Sell %"><input className="input" value={taxSell} onChange={(e) => setTaxSell(dec(e))} /></Field>
                      <Field label="Base %"><input className="input" value={taxBase} onChange={(e) => setTaxBase(dec(e))} /></Field>
                      <Field label="Decay (days)"><input className="input" value={taxDecay} onChange={(e) => setTaxDecay(dec(e))} /></Field>
                    </div>
                    {(Number(taxBase) > Number(taxBuy) || Number(taxBase) > Number(taxSell)) && (
                      <p className="text-xs text-amber-400">Base % must be ≤ both initial taxes.</p>
                    )}
                    {(Number(taxBuy) > 10 || Number(taxSell) > 10) && <p className="text-xs text-amber-400">Max tax is 10%.</p>}
                  </>
                )}

                {enabled.lock && k === "lock" && (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">Logic</span>
                      <button className={lockLogic === "AND" ? "btn-primary" : "btn-ghost"} onClick={() => setLockLogic("AND")}>AND</button>
                      <button className={lockLogic === "OR" ? "btn-primary" : "btn-ghost"} onClick={() => setLockLogic("OR")}>OR</button>
                    </div>
                    <label className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" checked={lockTime} onChange={() => setLockTime((v) => !v)} /> Time — unlock
                      <input className="input inline-block w-16" value={lockDelay} onChange={(e) => setLockDelay(num(e))} /> day(s) after launch ends
                    </label>
                    <label className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" checked={lockVolume} onChange={() => setLockVolume((v) => !v)} /> Volume — threshold
                      <input className="input inline-block w-28" value={lockVolThreshold} onChange={(e) => setLockVolThreshold(dec(e))} /> {pairSym}
                    </label>
                    {!lockTime && !lockVolume && <p className="text-xs text-amber-400">Keep at least one condition.</p>}
                  </div>
                )}

                {enabled.whitelist && k === "whitelist" && (
                  <Field label="Whitelist window (min, within launch)"><input className="input" value={wlWindow} onChange={(e) => setWlWindow(num(e))} /></Field>
                )}
              </div>
            ))}
          </div>
          <div className="card">
            <h4 className="mb-2 text-sm font-semibold">Hook plan — what runs on-chain</h4>
            <div className="space-y-2">{plan.map((f) => <HookExplainer key={f.key} feature={f.key} />)}</div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Review</h3>
          {preview ? (
            <div className="card space-y-1 text-sm">
              <Row label="Token">{tokenMode === "new" ? `${name} (${symbol}), new` : truncateAddress(existingToken)}</Row>
              <Row label="Pair">{pairMode === "native" ? "native ETH" : truncateAddress(pairAddress)}</Row>
              <Row label="Fee">{preview.params.fee === 0x800000 ? "dynamic (tax)" : `${preview.params.fee / 10000}%`}</Row>
              <Row label="Ticks">{preview.params.tickLower} … {preview.params.tickUpper}</Row>
              <Row label="Liquidity">{preview.params.liquidity.toString()}</Row>
              <Row label="Max token0 / token1">{formatAmount(preview.params.amount0Max, 18, 4)} / {formatAmount(preview.params.amount1Max, 18, 4)}</Row>
              {preview.value > 0n && <Row label="ETH value">{formatAmount(preview.value, 18, 6)}</Row>}
            </div>
          ) : (
            <p className="text-sm text-amber-300">Fill in token, pair and seed amounts to preview the launch.</p>
          )}
          <div className="space-y-2">{plan.map((f) => <HookExplainer key={f.key} feature={f.key} />)}</div>
        </div>
      )}

      {step === 4 && (
        <div className="card space-y-3 text-sm">
          <p className="font-medium">Sign &amp; launch</p>
          {!supported && <p className="text-amber-300">Connect to a supported chain.</p>}
          {result ? (
            <div className="space-y-2">
              <p className="text-emerald-400">Campaign launched ✓</p>
              <p className="font-mono text-xs break-all">PoolId: {result.pid}</p>
              <div className="flex gap-2">
                <Link className="btn-primary" href={`/swap/${chainId}/${result.pid}`}>Trade →</Link>
                <a className="btn-ghost" href={`${EXPLORER[chainId as SupportedChainId]}/tx/${result.hash}`} target="_blank" rel="noreferrer">View tx ↗</a>
              </div>
              <p className="text-xs text-neutral-500">Manage it on the Governance page (paste the PoolId above).</p>
            </div>
          ) : (
            <>
              <p className="text-neutral-400">
                Deploys the token (if new + ERC-20 pair), signs Permit2 (if pulling ERC-20s), then
                <code className="mx-1 font-mono">simulate → launchCampaign</code>. Fresh token + native ETH needs no Permit2.
              </p>
              <button className="btn-primary" disabled={!supported || !!stage} onClick={() => run(form)}>
                {stage ?? "Launch campaign"}
              </button>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => (s - 1) as StepIndex)}>Back</button>
        <button className="btn-primary" disabled={step === 4} onClick={() => setStep((s) => (s + 1) as StepIndex)}>Next</button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono text-neutral-200">{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
