import type { Address, Hex } from "viem";

/** Mirrors MechanismConfig.EnabledMechanisms. */
export interface EnabledMechanisms {
  antiSnipe: boolean;
  tax: boolean;
  lock: boolean;
  whitelist: boolean;
}

/** Mirrors AntiSnipeMechanism.AntiSnipeConfig. */
export interface AntiSnipeConfig {
  antiSnipeDuration: number; // uint32 seconds, MAX 1 day
  maxBuyAmountIn: bigint; // uint128 pair-wei
}

/** Mirrors BuySellTaxMechanism.BuySellTaxConfig (V4 fee units; MAX_TAX = 100000). */
export interface BuySellTaxConfig {
  initialBuyTax: number;
  initialSellTax: number;
  baseTax: number;
  decayDuration: number; // uint32 seconds
  manualBuyTax: number; // must be 0 at init
  manualSellTax: number; // must be 0 at init
}

export enum UnlockLogic {
  AND = 0,
  OR = 1,
}

/** Mirrors LiquidityLockMechanism.LiquidityLockConfig. */
export interface LiquidityLockConfig {
  logic: UnlockLogic;
  timeEnabled: boolean;
  volumeEnabled: boolean;
  unlockTime: bigint; // uint64, >= launchEndTime
  unlockVolumeThreshold: bigint; // uint128 pair-wei
}

/** Mirrors WhitelistPhaseMechanism.WhitelistPhaseConfig. */
export interface WhitelistPhaseConfig {
  whitelistEndTime: bigint; // uint64, in (launchTime, launchEndTime]
}

/** Mirrors MechanismConfig.LaunchConfig. deployer/tokenIsCurrency0/expectedInitialSqrtPrice are
 *  left zero/false — the wrapper injects them. */
export interface LaunchConfig {
  deployer: Address;
  launchDuration: bigint; // uint64 seconds, [1 day, 365 days]
  tokenIsCurrency0: boolean;
  expectedInitialSqrtPrice: bigint; // uint160
  enabled: EnabledMechanisms;
  antiSnipe: AntiSnipeConfig;
  tax: BuySellTaxConfig;
  lock: LiquidityLockConfig;
  whitelist: WhitelistPhaseConfig;
}

/** Mirrors TokenFactory.TokenDeployConfig. */
export interface TokenDeployConfig {
  name: string;
  symbol: string;
  totalSupply: bigint; // 18 decimals
}

/** Mirrors CampaignWrapper.CampaignParams. */
export interface CampaignParams {
  existingToken: Address; // 0x0 → deploy new
  tokenConfig: TokenDeployConfig;
  pairToken: Address; // 0x0 → native ETH
  fee: number; // 0x800000 if tax enabled
  tickSpacing: number;
  sqrtPriceInit: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
  lpRecipient: Address;
  launchConfig: LaunchConfig;
}

export interface LaunchSubmission {
  params: CampaignParams;
  permitData: Hex; // "0x" when no ERC-20 pull is needed
  value: bigint; // native ETH seed forwarded as msg.value
}
