import { BaseError, ContractFunctionRevertedError } from "viem";

/**
 * Friendly text for the hook/wrapper custom errors. When a write is simulated first (eth_call), viem
 * decodes the revert against the contract ABI and exposes `errorName` — so unlike the swap path (where
 * the hook error is wrapped in the router/quoter and must be byte-scanned, see swap/revertReason.ts),
 * here we can map the decoded name directly.
 */
const ERROR_MESSAGES: Record<string, string> = {
  CanOnlyRelax:
    "Values can only be relaxed — tax lowered, lock shortened, or whitelist window shrunk. The new value isn't a relaxation of the current one.",
  CanOnlyLowerTax: "Tax can only be lowered, not raised.",
  TaxExceedsMax: "Tax exceeds the maximum allowed (10%).",
  TaxRequiresDynamicFee: "This pool isn't using the dynamic fee — tax overrides aren't available.",
  InvalidTaxConfig: "Invalid tax configuration.",
  InvalidWhitelistEndTime: "Invalid whitelist end time.",
  LaunchEnded: "The launch window has ended — governance is frozen.",
  MustKeepOneCondition: "At least one unlock condition (time or volume) must stay enabled.",
  NoConditionsEnabled: "At least one unlock condition must be enabled.",
  AlreadyOr: "Lock logic is already OR.",
  UnlockTimeBeforeLaunchEnd: "Unlock time can't be earlier than the launch end.",
  LiquidityStillLocked: "Liquidity is still locked — unlock conditions aren't met yet.",
  NotGovernanceOwner: "Only the governance-NFT owner can perform this action.",
  NotInitialized: "No campaign is initialized for this pool.",
  NotWhitelisted: "This address isn't whitelisted.",
  CannotBurnGovernanceNFT: "The governance NFT can't be burned while the campaign is active.",
};

/**
 * Decode a (simulated or sent) contract-write error into a human reason. Walks the viem error chain for
 * a decoded custom error first, then handles the common wallet/funds cases, then falls back to viem's
 * own short message.
 */
export function decodeContractError(err: unknown, fallback = "Transaction would revert."): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name];
      if (name) return `Reverted: ${name}`;
      if (revert.reason) return revert.reason;
    }
    const m = err.message.toLowerCase();
    if (m.includes("user rejected") || m.includes("user denied")) return "Transaction rejected in the wallet.";
    if (m.includes("insufficient funds")) return "Insufficient funds for the transaction (value + gas).";
    return err.shortMessage || fallback;
  }
  return err instanceof Error ? err.message.split("\n")[0] : fallback;
}
