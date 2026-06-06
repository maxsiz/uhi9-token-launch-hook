import { useReadContract } from "wagmi";
import type { Address, Hex } from "viem";

import { CampaignLensAbi } from "../config/abi";
import { CONTRACTS, isDeployed } from "../config/contracts.generated";
import { isSupportedChain, type SupportedChainId } from "../config/chains";

/** Decoded `CampaignLens.CampaignView` (mirrors src/CampaignLens.sol). */
export interface CampaignView {
  pid: Hex;
  poolKey: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
  initialized: boolean;
  tokenIsCurrency0: boolean;
  governanceTokenId: bigint;
  governanceOwner: Address;
  deployer: Address;
  launchTime: bigint;
  launchEndTime: bigint;
  phase: number; // 0 Pre / 1 Active / 2 Frozen
  enabled: { antiSnipe: boolean; tax: boolean; lock: boolean; whitelist: boolean };
  antiSnipe: { antiSnipeDuration: number; maxBuyAmountIn: bigint };
  tax: {
    initialBuyTax: number;
    initialSellTax: number;
    baseTax: number;
    decayDuration: number;
    manualBuyTax: number;
    manualSellTax: number;
  };
  effectiveBuyTax: number;
  effectiveSellTax: number;
  lock: {
    logic: number;
    timeEnabled: boolean;
    volumeEnabled: boolean;
    unlockTime: bigint;
    unlockVolumeThreshold: bigint;
  };
  cumulativeVolume: bigint;
  lockUnlocked: boolean;
  whitelist: { whitelistEndTime: bigint };
}

/**
 * Read a full campaign snapshot from CampaignLens in one call. Returns the standard wagmi query result
 * with `data` typed as `CampaignView`. Disabled until the chain is supported, deployed, and a pid is given.
 */
export function useCampaign(chainId: number | undefined, pid: Hex | undefined) {
  const supported = isSupportedChain(chainId);
  const lens = supported ? CONTRACTS[chainId as SupportedChainId].lens : undefined;
  const enabled = Boolean(supported && pid && isDeployed(chainId as SupportedChainId));

  const query = useReadContract({
    chainId: supported ? (chainId as SupportedChainId) : undefined,
    address: lens,
    abi: CampaignLensAbi,
    functionName: "getCampaign",
    args: pid ? [pid] : undefined,
    query: { enabled },
  });

  return { ...query, campaign: query.data as CampaignView | undefined };
}
