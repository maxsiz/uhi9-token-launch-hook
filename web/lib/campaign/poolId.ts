/** Derive PoolId = keccak256(abi.encode(PoolKey)) for governance lookups (DESIGN.md §4.6). */
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

const POOL_KEY_TUPLE = [
  {
    type: "tuple",
    components: [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
  },
] as const;

export function computePoolId(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters(POOL_KEY_TUPLE, [key]));
}

/** Sort token + pair into (currency0, currency1) per v4 address-order convention. */
export function sortCurrencies(token: Address, pair: Address): [Address, Address] {
  return BigInt(token) < BigInt(pair) ? [token, pair] : [pair, token];
}
