// GENERATED FILE — do not hand-edit. Source: broadcast/DeployStack.s.sol/{chainId}/run-latest.json
import type { Address } from "viem";
import { mainnet, base, arbitrum, unichain } from "wagmi/chains";
import type { SupportedChainId } from "./chains";

export interface StackAddresses {
  hook: Address;
  wrapper: Address;
  factory: Address;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const CONTRACTS: Record<SupportedChainId, StackAddresses> = {
  [mainnet.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000" },
  [base.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000" },
  [arbitrum.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000" },
  [unichain.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000" },
};

export function isDeployed(chainId: SupportedChainId): boolean {
  return CONTRACTS[chainId].wrapper !== ZERO;
}
