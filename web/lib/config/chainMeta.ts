import { mainnet, base, arbitrum, unichain, unichainSepolia } from "wagmi/chains";
import type { SupportedChainId } from "./chains";

/** Per-chain display metadata for the network selector: brand logo, short label, fallback color. */
export interface ChainMeta {
  logo: string; // path under /public
  short: string; // initials for the colored-circle fallback
  color: string; // fallback circle background
}

export const CHAIN_META: Record<SupportedChainId, ChainMeta> = {
  [mainnet.id]: { logo: "/chains/1.svg", short: "ETH", color: "#627EEA" },
  [base.id]: { logo: "/chains/8453.svg", short: "BA", color: "#0052FF" },
  [arbitrum.id]: { logo: "/chains/42161.svg", short: "AR", color: "#28A0F0" },
  [unichain.id]: { logo: "/chains/130.svg", short: "UNI", color: "#F50DB4" },
  // Unichain Sepolia reuses the Unichain brand mark (testnet of the same network).
  [unichainSepolia.id]: { logo: "/chains/130.svg", short: "UNs", color: "#F50DB4" },
};

const byId = CHAIN_META as Record<number, ChainMeta>;

export function chainLogo(id: number): string | undefined {
  return byId[id]?.logo;
}

export function chainShort(id: number): string {
  return byId[id]?.short ?? "?";
}

export function chainColor(id: number): string {
  return byId[id]?.color ?? "#52525b";
}
