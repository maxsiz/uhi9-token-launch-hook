/**
 * Client-side validation mirroring the contract reverts (DESIGN.md §6) so users never sign a
 * transaction that will revert. Constants verified against src/mechanisms/*.sol.
 */
import { z } from "zod";

export const MAX_TAX = 100_000; // BuySellTaxMechanism.MAX_TAX (10%)
export const MAX_ANTISNIPE_DURATION = 86_400; // 1 day
export const MIN_LAUNCH_DURATION = 86_400; // 1 day
export const MAX_LAUNCH_DURATION = 365 * 86_400; // 365 days

export const taxSchema = z
  .object({
    initialBuyTax: z.number().int().min(0).max(MAX_TAX),
    initialSellTax: z.number().int().min(0).max(MAX_TAX),
    baseTax: z.number().int().min(0).max(MAX_TAX),
    decayDuration: z.number().int().min(0),
  })
  .refine((t) => t.baseTax <= t.initialBuyTax && t.baseTax <= t.initialSellTax, {
    message: "baseTax must be ≤ both initial taxes (InvalidTaxConfig)",
    path: ["baseTax"],
  });

export const antiSnipeSchema = z.object({
  antiSnipeDuration: z.number().int().min(0).max(MAX_ANTISNIPE_DURATION),
  maxBuyAmountIn: z.bigint().min(0n),
});

export const launchDurationSchema = z
  .bigint()
  .min(BigInt(MIN_LAUNCH_DURATION), "launchDuration < 1 day (InvalidLaunchDuration)")
  .max(BigInt(MAX_LAUNCH_DURATION), "launchDuration > 365 days (InvalidLaunchDuration)");

/** lock: at least one condition; if time, unlockTime ≥ launchEndTime; if volume, threshold > 0. */
export function validateLock(
  lock: { timeEnabled: boolean; volumeEnabled: boolean; unlockTime: bigint; unlockVolumeThreshold: bigint },
  launchEndTime: bigint
): string | null {
  if (!lock.timeEnabled && !lock.volumeEnabled) return "Enable at least one unlock condition (NoConditionsEnabled)";
  if (lock.timeEnabled && lock.unlockTime < launchEndTime) return "unlockTime must be ≥ launchEndTime (UnlockTimeBeforeLaunchEnd)";
  if (lock.volumeEnabled && lock.unlockVolumeThreshold <= 0n) return "unlockVolumeThreshold must be > 0";
  return null;
}

/** whitelist: launchTime < whitelistEndTime ≤ launchEndTime. */
export function validateWhitelist(whitelistEndTime: bigint, launchTime: bigint, launchEndTime: bigint): string | null {
  if (whitelistEndTime <= launchTime || whitelistEndTime > launchEndTime)
    return "whitelistEndTime must be in (launchTime, launchEndTime] (InvalidWhitelistEndTime)";
  return null;
}
