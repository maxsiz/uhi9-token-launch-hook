import type { Address, PublicClient } from "viem";
import { V4QuoterAbi } from "../config/abi";

export interface PoolKeyStruct {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface QuoteParams {
  quoter: Address;
  poolKey: PoolKeyStruct;
  zeroForOne: boolean;
  amountIn: bigint;
  /**
   * The trader's address — passed as the eth_call `from`, so the hook's beforeSwap sees the real
   * `tx.origin`. WITHOUT this the simulation runs as `0x0` and a whitelisted user still gets a
   * `NotWhitelisted` revert. Always pass the connected account.
   */
  account?: Address;
}

/**
 * Quote a single-hop exact-input swap via V4Quoter. The quoter runs the hook's beforeSwap, so it
 * reverts on the exact conditions a real swap would (whitelist phase, anti-snipe cap, …) — callers
 * should surface that as the disabled reason. Not a `view` fn: called via eth_call (`simulateContract`).
 */
export async function quoteExactInputSingle(client: PublicClient, p: QuoteParams): Promise<bigint> {
  const { result } = await client.simulateContract({
    account: p.account,
    address: p.quoter,
    abi: V4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: p.poolKey, zeroForOne: p.zeroForOne, exactAmount: p.amountIn, hookData: "0x" }],
  });
  return (result as readonly [bigint, bigint])[0];
}
