/**
 * Assemble CampaignWrapper.CampaignParams from wizard form state. The wrapper encodes hookData
 * itself (MechanismConfig.encode) and injects deployer / tokenIsCurrency0 / expectedInitialSqrtPrice,
 * so those are left zero/false here (DESIGN.md §4.3).
 */
import type { Address } from "viem";
import { DYNAMIC_FEE_FLAG } from "../config/uniswap";
import { UnlockLogic, type CampaignParams, type EnabledMechanisms, type LaunchConfig } from "./types";
import type { MintMathOutput } from "./priceMath";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export interface BuildParamsInput {
  existingToken?: Address; // undefined ⇒ deploy new
  tokenConfig: { name: string; symbol: string; totalSupply: bigint };
  pairToken?: Address; // undefined ⇒ native ETH
  staticFee: number; // used only when tax is disabled
  tickSpacing: number;
  lpRecipient: Address;
  launchDurationSeconds: bigint;
  enabled: EnabledMechanisms;
  antiSnipe: { antiSnipeDuration: number; maxBuyAmountIn: bigint };
  tax: { initialBuyTax: number; initialSellTax: number; baseTax: number; decayDuration: number };
  lock: { logic: UnlockLogic; timeEnabled: boolean; volumeEnabled: boolean; unlockTime: bigint; unlockVolumeThreshold: bigint };
  whitelist: { whitelistEndTime: bigint };
  mint: MintMathOutput;
}

export function buildCampaignParams(i: BuildParamsInput): CampaignParams {
  const launchConfig: LaunchConfig = {
    deployer: ZERO, // wrapper sets = msg.sender
    launchDuration: i.launchDurationSeconds,
    tokenIsCurrency0: false, // wrapper sets from PoolKey sorting
    expectedInitialSqrtPrice: 0n, // wrapper sets = sqrtPriceInit
    enabled: i.enabled,
    antiSnipe: { ...i.antiSnipe },
    tax: { ...i.tax, manualBuyTax: 0, manualSellTax: 0 },
    lock: { ...i.lock },
    whitelist: { ...i.whitelist },
  };

  return {
    existingToken: i.existingToken ?? ZERO,
    tokenConfig: i.tokenConfig,
    pairToken: i.pairToken ?? ZERO,
    fee: i.enabled.tax ? DYNAMIC_FEE_FLAG : i.staticFee,
    tickSpacing: i.tickSpacing,
    sqrtPriceInit: i.mint.sqrtPriceInit,
    tickLower: i.mint.tickLower,
    tickUpper: i.mint.tickUpper,
    liquidity: i.mint.liquidity,
    amount0Max: i.mint.amount0Max,
    amount1Max: i.mint.amount1Max,
    lpRecipient: i.lpRecipient,
    launchConfig,
  };
}

/** Native-ETH + fresh-token launches need no Permit2 signature. */
export function needsPermit2(params: CampaignParams): boolean {
  const newToken = params.existingToken === ZERO;
  const nativePair = params.pairToken === ZERO;
  return !(newToken && nativePair);
}
