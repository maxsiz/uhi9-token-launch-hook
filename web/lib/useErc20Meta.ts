"use client";

import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { Erc20Abi } from "@/lib/config/abi";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export interface Erc20Meta {
  name?: string;
  symbol?: string;
  decimals?: number;
  balance?: bigint; // of the connected account (undefined when not connected)
  isToken: boolean; // a successful decimals() read ⇒ address looks like an ERC-20
  isLoading: boolean;
}

/**
 * Resolve standard ERC-20 metadata (name / symbol / decimals) + the connected account's balance for a
 * pasted address. Disabled until `token` is a syntactically valid address. Used to auto-fill decimals
 * and show a balance hint wherever the UI asks for an ERC-20 address.
 */
export function useErc20Meta(chainId: number, token?: Address): Erc20Meta {
  const { address: account } = useAccount();
  const enabled = Boolean(token && /^0x[0-9a-fA-F]{40}$/.test(token));
  const owner = (account ?? ZERO) as Address;

  const reads = useReadContracts({
    contracts: enabled
      ? [
          { chainId, address: token as Address, abi: Erc20Abi, functionName: "name" },
          { chainId, address: token as Address, abi: Erc20Abi, functionName: "symbol" },
          { chainId, address: token as Address, abi: Erc20Abi, functionName: "decimals" },
          { chainId, address: token as Address, abi: Erc20Abi, functionName: "balanceOf", args: [owner] },
        ]
      : [],
    query: { enabled },
  });

  const decimals = reads.data?.[2]?.result as number | undefined;
  return {
    name: reads.data?.[0]?.result as string | undefined,
    symbol: reads.data?.[1]?.result as string | undefined,
    decimals,
    balance: account ? (reads.data?.[3]?.result as bigint | undefined) : undefined,
    isToken: enabled && reads.data?.[2]?.status === "success",
    isLoading: enabled && reads.isLoading,
  };
}
