// GENERATED FILE — do not hand-edit. Source: broadcast/DeployStack.s.sol/{chainId}/run-latest.json
import type { Address } from "viem";
import { mainnet, base, arbitrum, unichain, unichainSepolia } from "wagmi/chains";
import type { SupportedChainId } from "./chains";

export interface StackAddresses {
  hook: Address;
  wrapper: Address;
  factory: Address;
  lens: Address;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const CONTRACTS: Record<SupportedChainId, StackAddresses> = {
  [mainnet.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000", lens: "0x0000000000000000000000000000000000000000" },
  [base.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000", lens: "0x0000000000000000000000000000000000000000" },
  [arbitrum.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000", lens: "0x0000000000000000000000000000000000000000" },
  [unichain.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000", lens: "0x0000000000000000000000000000000000000000" },
  [unichainSepolia.id]: { hook: "0x79880abb0c03233e40b87452e7a45abd96ab0ac0", wrapper: "0x6f8679bba6c01c82b5809f2fd6767ddbde53657b", factory: "0x41cb3079a635bc11183c188281b8db14e4c57f9a", lens: "0x5a94af1fad259528c8825f254c3d1f85e7896e9e" },
};

export function isDeployed(chainId: SupportedChainId): boolean {
  return CONTRACTS[chainId].wrapper !== ZERO;
}

/** Stack deploy block per chain — lower bound for log-based position discovery (0 if not deployed). */
export const DEPLOY_BLOCK: Record<SupportedChainId, bigint> = {
  [mainnet.id]: 0n,
  [base.id]: 0n,
  [arbitrum.id]: 0n,
  [unichain.id]: 0n,
  [unichainSepolia.id]: 53872706n,
};
