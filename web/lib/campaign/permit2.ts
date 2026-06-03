/**
 * Permit2 batch signing for ERC-20 launches (existing token and/or ERC-20 pair).
 * Returns `0x` when no pull is needed (fresh token + native ETH).
 *
 * SCAFFOLD: shape is final; the EIP-712 sign + encode body is a marked TODO (DESIGN.md §4.4).
 * Implement with viem signTypedData against the Permit2 domain and encodeAbiParameters of the
 * (PermitBatch, signature) tuple matching abi.decode in CampaignWrapper.
 */
import type { Address, Hex } from "viem";

export interface Permit2Input {
  owner: Address;
  spender: Address; // CampaignWrapper
  chainId: number;
  tokens: { token: Address; amount: bigint }[];
}

/**
 * @throws not-implemented in the scaffold.
 */
export async function buildPermitData(_input: Permit2Input): Promise<Hex> {
  // 1. read Permit2.allowance(owner, token, spender) → nonce per token
  // 2. assemble PermitBatch { details[], spender, sigDeadline }
  // 3. walletClient.signTypedData({ domain:{ name:"Permit2", chainId, verifyingContract: PERMIT2 }, ... })
  // 4. encodeAbiParameters([PermitBatch tuple, "bytes"], [permitBatch, signature])
  throw new Error("permit2.buildPermitData: TODO — implement EIP-712 sign + encode (DESIGN.md §4.4)");
}

export const EMPTY_PERMIT: Hex = "0x";
