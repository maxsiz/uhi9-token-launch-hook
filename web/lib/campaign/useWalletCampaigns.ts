"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { parseAbiItem, type Address, type Hex } from "viem";

import { CampaignLensAbi, Erc721Abi } from "@/lib/config/abi";
import { CONTRACTS, DEPLOY_BLOCK, isDeployed } from "@/lib/config/contracts.generated";
import { UNISWAP } from "@/lib/config/uniswap";
import { isSupportedChain, type SupportedChainId } from "@/lib/config/chains";
import type { CampaignView } from "./useCampaign";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const CHUNK = 10_000n; // QuickNode caps eth_getLogs at a 10k block range

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

/** PositionManager LP-NFT tokenIds the wallet has received (chunked logs to stay under the range cap). */
async function receivedTokenIds(client: Client, posm: Address, owner: Address, fromBlock: bigint): Promise<bigint[]> {
  const latest = await client.getBlockNumber();
  const windows: Promise<{ args: { tokenId?: bigint } }[]>[] = [];
  for (let start = fromBlock; start <= latest; start += CHUNK) {
    const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
    windows.push(client.getLogs({ address: posm, event: TRANSFER, args: { to: owner }, fromBlock: start, toBlock: end }));
  }
  const logs = (await Promise.all(windows)).flat();
  const ids = new Set<bigint>();
  for (const l of logs) if (l.args.tokenId != null) ids.add(l.args.tokenId);
  return [...ids];
}

/**
 * Campaigns the connected wallet holds an LP NFT in, on the current chain. Discovers PositionManager
 * NFTs via Transfer logs (no ERC721Enumerable, no indexer/keys), filters to currently-owned, then
 * resolves each to a campaign via CampaignLens.getCampaignByTokenId (reverts for non-hook pools).
 */
export function useWalletCampaigns(chainIdInput?: number) {
  const { address } = useAccount();
  const chainId = isSupportedChain(chainIdInput) ? (chainIdInput as SupportedChainId) : undefined;
  const client = usePublicClient({ chainId });
  const lens = chainId ? CONTRACTS[chainId].lens : undefined;
  const posm = chainId ? UNISWAP[chainId].positionManager : undefined;
  const fromBlock = chainId ? DEPLOY_BLOCK[chainId] : 0n;
  const enabled = Boolean(address && chainId && client && posm && isDeployed(chainId));

  const query = useQuery({
    queryKey: ["walletCampaigns", chainId, address],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<CampaignView[]> => {
      const owner = address as Address;
      const ids = await receivedTokenIds(client as Client, posm as Address, owner, fromBlock);
      if (ids.length === 0) return [];

      // Keep only tokens still owned by the wallet.
      const owners = await (client as Client).multicall({
        contracts: ids.map((id) => ({ address: posm as Address, abi: Erc721Abi, functionName: "ownerOf", args: [id] }) as const),
        allowFailure: true,
      });
      const owned = ids.filter((_, i) => owners[i].status === "success" && (owners[i].result as Address).toLowerCase() === owner.toLowerCase());
      if (owned.length === 0) return [];

      // Resolve each owned LP NFT to its campaign (reverts ⇒ not one of our pools).
      const resolved = await (client as Client).multicall({
        contracts: owned.map((id) => ({ address: lens as Address, abi: CampaignLensAbi, functionName: "getCampaignByTokenId", args: [id] }) as const),
        allowFailure: true,
      });
      const byPid = new Map<Hex, CampaignView>();
      for (const r of resolved) {
        if (r.status !== "success") continue;
        const view = (r.result as [Hex, CampaignView])[1];
        if (view?.initialized) byPid.set(view.pid, view);
      }
      return [...byPid.values()];
    },
  });

  return { campaigns: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}
