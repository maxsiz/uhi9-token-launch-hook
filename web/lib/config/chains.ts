import { mainnet, base, arbitrum, unichain, unichainSepolia } from "wagmi/chains";
import { http, fallback, type Transport } from "viem";

/** Chains the launch stack is deployed on (must match HookDeployLib.canonical). */
export const SUPPORTED_CHAINS = [mainnet, base, arbitrum, unichain, unichainSepolia] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

export const SUPPORTED_CHAIN_IDS = SUPPORTED_CHAINS.map((c) => c.id) as SupportedChainId[];

/** Public fallback RPCs — used after the env-configured primary in a viem `fallback` transport. */
const PUBLIC_FALLBACK_RPC: Record<SupportedChainId, string> = {
  [mainnet.id]: "https://eth.llamarpc.com",
  [base.id]: "https://mainnet.base.org",
  [arbitrum.id]: "https://arb1.arbitrum.io/rpc",
  [unichain.id]: "https://mainnet.unichain.org",
  [unichainSepolia.id]: "https://sepolia.unichain.org",
};

const ENV_RPC: Record<SupportedChainId, string | undefined> = {
  [mainnet.id]: process.env.NEXT_PUBLIC_RPC_URL_1,
  [base.id]: process.env.NEXT_PUBLIC_RPC_URL_8453,
  [arbitrum.id]: process.env.NEXT_PUBLIC_RPC_URL_42161,
  [unichain.id]: process.env.NEXT_PUBLIC_RPC_URL_130,
  [unichainSepolia.id]: process.env.NEXT_PUBLIC_RPC_URL_1301,
};

/**
 * Server-side RPC proxy (`/app/api/rpc`) used as the PRIMARY transport for chains whose paid key
 * should stay off the client — set the matching server-only `RPC_URL_<id>` to enable it. The proxy
 * returns 501 when unconfigured, so viem's `fallback` simply moves on to env/public URLs.
 */
const PROXY_RPC: Partial<Record<SupportedChainId, string>> = {
  [unichainSepolia.id]: "/api/rpc?chainId=1301",
};

/** Build a resilient transport per chain: proxy → env primary → public fallback. */
export const transports: Record<SupportedChainId, Transport> = Object.fromEntries(
  SUPPORTED_CHAINS.map((c) => {
    const urls = [PROXY_RPC[c.id], ENV_RPC[c.id], PUBLIC_FALLBACK_RPC[c.id]].filter(Boolean) as string[];
    return [c.id, fallback(urls.map((u) => http(u, { retryCount: 2, timeout: 10_000 })))];
  })
) as Record<SupportedChainId, Transport>;

export function isSupportedChain(id?: number): id is SupportedChainId {
  return id != null && (SUPPORTED_CHAIN_IDS as number[]).includes(id);
}

export const EXPLORER: Record<SupportedChainId, string> = {
  [mainnet.id]: "https://etherscan.io",
  [base.id]: "https://basescan.org",
  [arbitrum.id]: "https://arbiscan.io",
  [unichain.id]: "https://uniscan.xyz",
  [unichainSepolia.id]: "https://sepolia.uniscan.xyz",
};
