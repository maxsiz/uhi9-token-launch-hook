import { formatUnits, parseUnits, type Address } from "viem";

export function truncateAddress(addr?: string, lead = 6, tail = 4): string {
  if (!addr) return "";
  return addr.length <= lead + tail ? addr : `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

export function formatAmount(value: bigint, decimals = 18, maxFrac = 6): string {
  const s = formatUnits(value, decimals);
  const [int, frac] = s.split(".");
  return frac ? `${int}.${frac.slice(0, maxFrac)}` : int;
}

export function toWei(human: string, decimals = 18): bigint {
  return parseUnits(human || "0", decimals);
}

/** V4 fee units → percent. 100000 units == 10%. */
export function taxUnitsToPercent(units: number): number {
  return units / 10_000;
}

/** Percent → V4 fee units. */
export function percentToTaxUnits(percent: number): number {
  return Math.round(percent * 10_000);
}

export const MAX_TAX_UNITS = 100_000; // 10%

export function isZeroAddress(addr?: Address): boolean {
  return !addr || addr === "0x0000000000000000000000000000000000000000";
}

/**
 * Format a unix timestamp (seconds) as an unambiguous UTC string `YYYY-MM-DD HH:MM UTC`.
 * Locale-independent — avoids the browser's mm/dd/yyyy default. Accepts bigint or number.
 */
export function formatUtc(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms)) return "—";
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
