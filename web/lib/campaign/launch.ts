/**
 * Turn wizard form state into a ready-to-submit CampaignWrapper.launchCampaign call. Shared by the
 * launch wizard UI and the headless launch test, so both exercise the same priceMath/buildParams path.
 *
 * Orientation: native-ETH pairs always have ETH as currency0 (address(0) sorts first), so a brand-new
 * token's orientation is known without its address. ERC-20 pairs need the token address to sort, so a
 * fresh-token + ERC-20-pair launch must deploy the token first and pass `tokenAddress`.
 */
import { parseUnits, type Address } from "viem";
import { buildCampaignParams } from "./buildParams";
import { computeMintParams } from "./priceMath";
import { UnlockLogic, type CampaignParams, type EnabledMechanisms } from "./types";
import { percentToTaxUnits } from "../format";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const DAY = 86_400n;

export interface LaunchFormInput {
  // token side
  newToken?: { name: string; symbol: string; totalSupply: bigint }; // undefined ⇒ existing token
  existingToken?: Address;
  tokenAddress?: Address; // resolved token address (existing, or fresh after factory deploy)
  tokenDecimals: number; // 18 for a factory token

  // pair side
  pair: { native: true } | { address: Address; decimals: number };

  // price + seed (human strings)
  seedTokenHuman: string;
  seedPairHuman: string;

  // lifecycle / pool
  launchDurationDays: number; // ≥ 1
  tickSpacing: number;
  staticFee: number;
  rangeTicks?: number;
  slippageBps?: number;
  lpRecipient: Address;

  // mechanisms
  enabled: EnabledMechanisms;
  whitelistWindowMinutes?: number; // when whitelist enabled
  modules?: ModuleConfigInput; // per-module tunables; falls back to defaults when absent
}

/** Human-unit module configs from the wizard (mapped to contract structs in prepareLaunch). */
export interface ModuleConfigInput {
  antiSnipe?: { durationMinutes: number; maxBuyHuman: string };
  tax?: { initialBuyPct: number; initialSellPct: number; basePct: number; decayDays: number };
  lock?: { logic: UnlockLogic; timeEnabled: boolean; unlockDelayDays: number; volumeEnabled: boolean; volumeThresholdHuman: string };
}

export interface PreparedLaunch {
  params: CampaignParams;
  value: bigint; // msg.value when the pair is native ETH
  /** ERC-20 sides the wrapper must pull via Permit2 (empty for fresh-token + native-ETH). */
  permitTokens: { token: Address; amount: bigint }[];
}

export function prepareLaunch(input: LaunchFormInput, nowSec: number): PreparedLaunch {
  const pairIsNative = "native" in input.pair;
  const pairDecimals = "native" in input.pair ? 18 : input.pair.decimals;
  const pairToken = "native" in input.pair ? ZERO : input.pair.address;
  const existingToken = input.existingToken ?? ZERO;

  // currency0 = lower address. Native ETH (0x0) always sorts first → token is currency1.
  const tokenIsCurrency0 = pairIsNative
    ? false
    : input.tokenAddress != null && BigInt(input.tokenAddress) < BigInt(pairToken);

  const tokenRaw = parseUnits(input.seedTokenHuman || "0", input.tokenDecimals);
  const pairRaw = parseUnits(input.seedPairHuman || "0", pairDecimals);

  const amount0 = tokenIsCurrency0 ? tokenRaw : pairRaw;
  const amount1 = tokenIsCurrency0 ? pairRaw : tokenRaw;
  const decimals0 = tokenIsCurrency0 ? input.tokenDecimals : pairDecimals;
  const decimals1 = tokenIsCurrency0 ? pairDecimals : input.tokenDecimals;

  const mint = computeMintParams({
    amount0,
    amount1,
    decimals0,
    decimals1,
    tickSpacing: input.tickSpacing,
    rangeTicks: input.rangeTicks,
    slippageBps: input.slippageBps,
  });

  const launchDurationSeconds = BigInt(Math.max(1, input.launchDurationDays)) * DAY;
  const launchEnd = BigInt(nowSec) + launchDurationSeconds;
  const en = input.enabled;
  const m = input.modules;

  // ── Anti-snipe (M1) ──
  const aCfg = m?.antiSnipe;
  const antiSnipe = {
    antiSnipeDuration: en.antiSnipe ? (aCfg ? Math.round(aCfg.durationMinutes * 60) : 3600) : 0,
    maxBuyAmountIn: en.antiSnipe && aCfg ? parseUnits(aCfg.maxBuyHuman || "0", pairDecimals) : amount1 / 50n,
  };

  // ── Tax (M2) ──
  const tCfg = m?.tax;
  const tax = en.tax
    ? tCfg
      ? {
          initialBuyTax: percentToTaxUnits(tCfg.initialBuyPct),
          initialSellTax: percentToTaxUnits(tCfg.initialSellPct),
          baseTax: percentToTaxUnits(tCfg.basePct),
          decayDuration: Math.round(tCfg.decayDays * 86_400),
        }
      : { initialBuyTax: percentToTaxUnits(3), initialSellTax: percentToTaxUnits(5), baseTax: percentToTaxUnits(0.3), decayDuration: Number(7n * DAY) }
    : { initialBuyTax: 0, initialSellTax: 0, baseTax: 0, decayDuration: 0 };

  // ── Liquidity lock (M3) ── keep ≥1 condition; unlockTime ≥ launchEnd (+1h buffer for mining delay).
  const lCfg = m?.lock;
  let timeEnabled = en.lock ? (lCfg ? lCfg.timeEnabled : true) : false;
  const volumeEnabled = en.lock && lCfg ? lCfg.volumeEnabled : false;
  if (en.lock && !timeEnabled && !volumeEnabled) timeEnabled = true;
  const delaySec = lCfg ? Math.max(3600, Math.round(lCfg.unlockDelayDays * 86_400)) : Number(DAY);
  const lock = {
    logic: lCfg ? lCfg.logic : UnlockLogic.AND,
    timeEnabled,
    volumeEnabled,
    unlockTime: launchEnd + BigInt(delaySec),
    unlockVolumeThreshold: en.lock && volumeEnabled && lCfg ? parseUnits(lCfg.volumeThresholdHuman || "0", pairDecimals) : 0n,
  };

  const params = buildCampaignParams({
    existingToken: existingToken === ZERO ? undefined : existingToken,
    tokenConfig: input.newToken ?? { name: "", symbol: "", totalSupply: 0n },
    pairToken: pairIsNative ? undefined : pairToken,
    staticFee: input.staticFee,
    tickSpacing: input.tickSpacing,
    lpRecipient: input.lpRecipient,
    launchDurationSeconds,
    enabled: en,
    antiSnipe,
    tax,
    lock,
    whitelist: { whitelistEndTime: BigInt(nowSec + (input.whitelistWindowMinutes ?? 30) * 60) },
    mint,
  });

  // For a native-ETH pair, forward the ETH-side cap as msg.value (ETH is currency0).
  const value = pairIsNative ? mint.amount0Max : 0n;

  const permitTokens: { token: Address; amount: bigint }[] = [];
  if (existingToken !== ZERO) permitTokens.push({ token: existingToken, amount: tokenRaw });
  if (!pairIsNative) permitTokens.push({ token: pairToken, amount: pairRaw });

  return { params, value, permitTokens };
}
