/**
 * Decode a swap/quote revert into a human reason. Hook errors bubble up wrapped inside the V4Quoter's
 * `UnexpectedRevertBytes(bytes)` (and v4 PoolManager wrappers), so viem can't auto-decode them against
 * the Quoter ABI. Instead we scan the raw revert bytes for known 4-byte error selectors.
 *
 * Selectors verified with `cast sig`:
 *   NotWhitelisted()                      0x584a7938
 *   BuyTooLarge()                         0x03a25e42
 *   ExactOutNotAllowedDuringAntiSnipe()   0x836c7852
 *   LaunchEnded()                         0x4a824366
 */
const SELECTOR_MESSAGES: Record<string, string> = {
  "584a7938": "Whitelist phase: this address isn't whitelisted (the swap is gated on tx.origin).",
  "03a25e42": "Anti-snipe: buy exceeds the per-transaction cap during the launch window.",
  "836c7852": "Anti-snipe: exact-output buys are blocked during the launch window — use exact input.",
  "4a824366": "The launch has ended.",
  // Common Uniswap v4 swap errors:
  "b8e3c385": "Swap amount cannot be zero.",
  "7c9c6e8f": "Not enough liquidity in the pool for this size.",
};

/** Pull every 0x… hex blob out of a viem error (message + nested causes) and concatenate it. */
function collectHex(err: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  const visit = (e: unknown, depth: number) => {
    if (e == null || depth > 6 || seen.has(e)) return;
    seen.add(e);
    if (typeof e === "string") {
      parts.push(e);
      return;
    }
    if (typeof e === "object") {
      const o = e as Record<string, unknown>;
      for (const k of ["data", "raw", "signature", "details", "shortMessage", "message", "metaMessages", "cause"]) {
        if (k in o) visit(o[k], depth + 1);
      }
    }
    if (Array.isArray(e)) e.forEach((x) => visit(x, depth + 1));
  };
  visit(err, 0);
  return parts.join(" ").toLowerCase();
}

/** Human-readable reason for a swap/quote revert, or a generic fallback. */
export function decodeRevertReason(err: unknown): string {
  const blob = collectHex(err);
  for (const [sel, msg] of Object.entries(SELECTOR_MESSAGES)) {
    if (blob.includes(sel)) return msg;
  }
  // Wallet user-rejection is common; surface it plainly.
  if (blob.includes("user rejected") || blob.includes("user denied")) return "Transaction rejected in the wallet.";
  if (blob.includes("insufficient funds")) return "Insufficient funds for the transaction (value + gas).";
  return "The swap would revert (whitelist phase, anti-snipe cap, or no liquidity).";
}
