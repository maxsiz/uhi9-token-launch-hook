/**
 * Hook Transparency Layer — single source of truth for the demo (DESIGN.md §5).
 *
 * Maps every UI feature/control to the exact `TokenLaunchHook` functionality it exercises:
 * the hook callback that runs, the mechanism module that enforces it, and a plain-language
 * description of what the hook does on-chain at that moment. Drives <HookBadge>,
 * <HookExplainer>, the Review "Hook plan", <HookCallTrace>, and <HookActivityPanel>.
 */

export type HookCallback =
  | "_beforeAddLiquidity"
  | "_beforeSwap"
  | "_afterSwap"
  | "_beforeRemoveLiquidity";

export type Mechanism =
  | "Governance"
  | "M1 AntiSnipe"
  | "M2 BuySellTax"
  | "M3 LiquidityLock"
  | "M5 WhitelistPhase";

/** Stable keys for every annotated feature in the app. */
export type HookFeatureKey =
  | "launch.bootstrap"
  | "launch.duration"
  | "antiSnipe"
  | "tax"
  | "lock"
  | "whitelist"
  | "govNftBurnProtection"
  | "gov.taxOverride"
  | "gov.relaxLock"
  | "gov.whitelist";

export interface HookFeature {
  key: HookFeatureKey;
  label: string;
  callbacks: HookCallback[];
  mechanism: Mechanism;
  /** One-line: what the hook does on-chain for this feature. */
  effect: string;
  /** Source module for "view the code" links. */
  source: string;
}

/** Accent color per callback (also defined in tailwind.config `colors.hook`). */
export const CALLBACK_COLOR: Record<HookCallback, string> = {
  _beforeAddLiquidity: "#22c55e",
  _beforeSwap: "#3b82f6",
  _afterSwap: "#a855f7",
  _beforeRemoveLiquidity: "#ef4444",
};

export const HOOK_MAP: Record<HookFeatureKey, HookFeature> = {
  "launch.bootstrap": {
    key: "launch.bootstrap",
    label: "Launch (first mint)",
    callbacks: ["_beforeAddLiquidity"],
    mechanism: "Governance",
    effect:
      "On the first mint the hook decodes hookData, captures the LP NFT as the governance NFT (salt == tokenId), checks tx.origin and the init price, and stores the enabled mechanisms.",
    source: "src/mechanisms/GovernanceModule.sol",
  },
  "launch.duration": {
    key: "launch.duration",
    label: "Launch duration / phase",
    callbacks: ["_beforeAddLiquidity"],
    mechanism: "Governance",
    effect:
      "Sets launchTime / launchEndTime. Governance setters are gated by onlyGovernance during the Active phase; launchPhaseOf reports Pre / Active / Frozen.",
    source: "src/mechanisms/GovernanceModule.sol",
  },
  antiSnipe: {
    key: "antiSnipe",
    label: "Anti-snipe window",
    callbacks: ["_beforeSwap"],
    mechanism: "M1 AntiSnipe",
    effect:
      "During the window, caps the per-transaction buy size to maxBuyAmountIn and blocks exact-out buys. Sells are never restricted.",
    source: "src/mechanisms/AntiSnipeMechanism.sol",
  },
  tax: {
    key: "tax",
    label: "Buy / sell tax",
    callbacks: ["_beforeSwap"],
    mechanism: "M2 BuySellTax",
    effect:
      "Returns a dynamic LP fee per swap, computed from the linear tax decay (asymmetric buy vs sell). Requires the pool's dynamic-fee flag.",
    source: "src/mechanisms/BuySellTaxMechanism.sol",
  },
  lock: {
    key: "lock",
    label: "Liquidity lock",
    callbacks: ["_afterSwap", "_beforeRemoveLiquidity"],
    mechanism: "M3 LiquidityLock",
    effect:
      "_afterSwap accumulates pair-side volume; _beforeRemoveLiquidity blocks the governance NFT from exiting until the time/volume unlock conditions (AND/OR) are met.",
    source: "src/mechanisms/LiquidityLockMechanism.sol",
  },
  whitelist: {
    key: "whitelist",
    label: "Whitelist phase",
    callbacks: ["_beforeSwap", "_beforeAddLiquidity"],
    mechanism: "M5 WhitelistPhase",
    effect:
      "Until whitelistEndTime, rejects swaps and liquidity adds from non-whitelisted addresses. Removing liquidity is always allowed.",
    source: "src/mechanisms/WhitelistPhaseMechanism.sol",
  },
  govNftBurnProtection: {
    key: "govNftBurnProtection",
    label: "Governance-NFT burn protection",
    callbacks: ["_beforeRemoveLiquidity"],
    mechanism: "Governance",
    effect:
      "Reverts any decrease/burn of the governance NFT during the Active phase, regardless of M3.",
    source: "src/mechanisms/GovernanceModule.sol",
  },
  "gov.taxOverride": {
    key: "gov.taxOverride",
    label: "Tax override",
    callbacks: ["_beforeSwap"],
    mechanism: "M2 BuySellTax",
    effect:
      "Governance ratchets the effective fee down (one-way) for all future swaps via setBuyTaxOverride / setSellTaxOverride.",
    source: "src/mechanisms/BuySellTaxMechanism.sol",
  },
  "gov.relaxLock": {
    key: "gov.relaxLock",
    label: "Relax / disable lock",
    callbacks: ["_beforeRemoveLiquidity"],
    mechanism: "M3 LiquidityLock",
    effect:
      "Governance loosens unlock conditions (earlier time, lower volume, switch to OR, or disable a condition) affecting future removeLiquidity checks.",
    source: "src/mechanisms/LiquidityLockMechanism.sol",
  },
  "gov.whitelist": {
    key: "gov.whitelist",
    label: "Manage whitelist",
    callbacks: ["_beforeSwap"],
    mechanism: "M5 WhitelistPhase",
    effect:
      "Governance adds/removes addresses and can shorten the gated window, affecting future swap admission.",
    source: "src/mechanisms/WhitelistPhaseMechanism.sol",
  },
};

/** Mechanism flags the wizard toggles → which feature keys they light up. */
export const ENABLED_TO_FEATURES: Record<"antiSnipe" | "tax" | "lock" | "whitelist", HookFeatureKey> = {
  antiSnipe: "antiSnipe",
  tax: "tax",
  lock: "lock",
  whitelist: "whitelist",
};

/**
 * Given the chosen enable-flags, return every hook feature that will run on the pool —
 * the data behind the Review "Hook plan" summary. Governance bootstrap + burn protection
 * always apply.
 */
export function hookPlan(enabled: {
  antiSnipe: boolean;
  tax: boolean;
  lock: boolean;
  whitelist: boolean;
}): HookFeature[] {
  const keys: HookFeatureKey[] = ["launch.bootstrap", "govNftBurnProtection"];
  if (enabled.antiSnipe) keys.push("antiSnipe");
  if (enabled.tax) keys.push("tax");
  if (enabled.lock) keys.push("lock");
  if (enabled.whitelist) keys.push("whitelist");
  return keys.map((k) => HOOK_MAP[k]);
}
