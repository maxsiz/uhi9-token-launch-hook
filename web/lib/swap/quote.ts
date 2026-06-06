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
}

/**
 * Quote a single-hop exact-input swap via V4Quoter. The quoter runs the hook's beforeSwap, so it
 * reverts on the exact conditions a real swap would (whitelist phase, anti-snipe cap, …) — callers
 * should surface that as the disabled reason. Not a `view` fn: called via eth_call (`simulateContract`).
 */
export async function quoteExactInputSingle(client: PublicClient, p: QuoteParams): Promise<bigint> {
  const { result } = await client.simulateContract({
    address: p.quoter,
    abi: V4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: p.poolKey, zeroForOne: p.zeroForOne, exactAmount: p.amountIn, hookData: "0x" }],
  });
  return (result as readonly [bigint, bigint])[0];
}
