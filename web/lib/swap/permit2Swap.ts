import type { Address } from "viem";

/** Permit2 approval expiration when granting the Universal Router an allowance (~30 days). */
export const PERMIT2_EXPIRATION_SECS = 60 * 60 * 24 * 30;
export const MAX_UINT160 = (1n << 160n) - 1n;
export const MAX_UINT256 = (1n << 256n) - 1n;
export const MAX_UINT48 = (1n << 48n) - 1n;

export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

export function isNative(currency: Address): boolean {
  return currency === NATIVE;
}

/**
 * Decide which approvals are still missing for an ERC-20 input to be swapped via Universal Router.
 * Two-step Permit2 model: token → Permit2 (ERC-20 allowance), then Permit2 → Universal Router.
 * Native ETH needs neither (it is forwarded as msg.value).
 */
export function planApprovals(opts: {
  inputCurrency: Address;
  amountIn: bigint;
  erc20AllowanceToPermit2: bigint | undefined;
  permit2AllowanceToRouter: bigint | undefined;
  permit2ExpirationToRouter: number | undefined;
  nowSec: number;
}): { needsErc20Approve: boolean; needsPermit2Approve: boolean } {
  if (isNative(opts.inputCurrency)) return { needsErc20Approve: false, needsPermit2Approve: false };
  const needsErc20Approve = (opts.erc20AllowanceToPermit2 ?? 0n) < opts.amountIn;
  const permit2Amount = opts.permit2AllowanceToRouter ?? 0n;
  const permit2Expired = (opts.permit2ExpirationToRouter ?? 0) <= opts.nowSec;
  const needsPermit2Approve = permit2Amount < opts.amountIn || permit2Expired;
  return { needsErc20Approve, needsPermit2Approve };
}
