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
  [mainnet.id]: { hook: "0x0b93309f6b6e404769de885dac66cb357ad30ac0", wrapper: "0x205549bcb010d429354aabc2cae057b090bcf5b8", factory: "0xa373fbacd0964fcb7bc01cb447a2f25f11e8995b", lens: "0xf8da8dc6d8cdcadcc96b51d5fc0cb59ef3672005" },
  [base.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000", lens: "0x0000000000000000000000000000000000000000" },
  [arbitrum.id]: { hook: "0x0000000000000000000000000000000000000000", wrapper: "0x0000000000000000000000000000000000000000", factory: "0x0000000000000000000000000000000000000000", lens: "0x0000000000000000000000000000000000000000" },
  [unichain.id]: { hook: "0xd5ca99907f2db792dcd4865e7d12df5f71874ac0", wrapper: "0xcc20f7c7763ef77703a552e75e27ceaea99dc8cb", factory: "0x653bce4d7a6cf5c4fdbbd5fc6b2bb41c8eafc56a", lens: "0x22bbbe241464ab67c9b4f0881fa45f7f2d26870f" },
  [unichainSepolia.id]: { hook: "0x79880abb0c03233e40b87452e7a45abd96ab0ac0", wrapper: "0x0ae47666b31fe6e684c381cbea7a80748682d575", factory: "0x41cb3079a635bc11183c188281b8db14e4c57f9a", lens: "0x5a94af1fad259528c8825f254c3d1f85e7896e9e" },
};

export function isDeployed(chainId: SupportedChainId): boolean {
  return CONTRACTS[chainId].wrapper !== ZERO;
}

/** Stack deploy block per chain — lower bound for log-based position discovery (0 if not deployed). */
export const DEPLOY_BLOCK: Record<SupportedChainId, bigint> = {
  [mainnet.id]: 25265847n,
  [base.id]: 0n,
  [arbitrum.id]: 0n,
  [unichain.id]: 50089742n,
  [unichainSepolia.id]: 53872706n,
};
