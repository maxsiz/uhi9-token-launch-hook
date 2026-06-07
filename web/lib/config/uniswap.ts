import type { Address } from "viem";
import { mainnet, base, arbitrum, unichain, unichainSepolia } from "wagmi/chains";
import type { SupportedChainId } from "./chains";

export interface UniswapAddresses {
  poolManager: Address;
  positionManager: Address;
  /** Swap-side periphery — present where the swap page is wired (verified on-chain). */
  universalRouter?: Address;
  quoter?: Address; // V4Quoter
  stateView?: Address;
}

/**
 * Canonical Uniswap v4 addresses per chain. PoolManager/PositionManager mirror
 * `script/MineSalt.s.sol` HookDeployLib.canonical(). Swap periphery (UniversalRouter/V4Quoter/
 * StateView) is filled where the swap UI runs.
 */
export const UNISWAP: Record<SupportedChainId, UniswapAddresses> = {
  // Ethereum mainnet — periphery verified on-chain (codesize > 0, poolManager() matches) 2026-06-07.
  [mainnet.id]: {
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
    universalRouter: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
    quoter: "0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203",
    stateView: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227",
  },
  [base.id]: {
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    positionManager: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
  },
  [arbitrum.id]: {
    poolManager: "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32",
    positionManager: "0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869",
  },
  // Unichain mainnet — periphery verified on-chain (codesize > 0, poolManager() matches) 2026-06-07.
  [unichain.id]: {
    poolManager: "0x1F98400000000000000000000000000000000004",
    positionManager: "0x4529A01c7A0410167c5740C487A8DE60232617bf",
    universalRouter: "0xEf740bf23aCaE26f6492B10de645D6B98dC8Eaf3",
    quoter: "0x333E3C607B141b18fF6de9f258db6e77fE7491E0",
    stateView: "0x86e8631A016F9068C3f085fAF484Ee3F5fDee8f2",
  },
  // Unichain Sepolia (testnet) — all verified on-chain (codesize > 0) 2026-06-06.
  [unichainSepolia.id]: {
    poolManager: "0x00B036B58a818B1BC34d502D3fE730Db729e62AC",
    positionManager: "0xf969Aee60879C54bAAed9F3eD26147Db216Fd664",
    universalRouter: "0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D",
    quoter: "0x56DCD40A3F2d466F48e7F48bDBE5Cc9B92Ae4472",
    stateView: "0xc199F1072a74D4e905ABa1A84d9a45E2546B6222",
  },
};

/** Permit2 — same address on every chain. */
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/** V4 dynamic-fee flag — required when the tax module is enabled. */
export const DYNAMIC_FEE_FLAG = 0x800000;
