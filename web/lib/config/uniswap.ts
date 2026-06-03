import type { Address } from "viem";
import { mainnet, base, arbitrum, unichain } from "wagmi/chains";
import type { SupportedChainId } from "./chains";

/**
 * Canonical Uniswap v4 PoolManager / PositionManager per chain.
 * Mirror of `script/MineSalt.s.sol` HookDeployLib.canonical() — verified 2026-05-31.
 */
export const UNISWAP: Record<SupportedChainId, { poolManager: Address; positionManager: Address }> = {
  [mainnet.id]: {
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
  },
  [base.id]: {
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    positionManager: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
  },
  [arbitrum.id]: {
    poolManager: "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32",
    positionManager: "0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869",
  },
  [unichain.id]: {
    poolManager: "0x1F98400000000000000000000000000000000004",
    positionManager: "0x4529A01c7A0410167c5740C487A8DE60232617bf",
  },
};

/** Permit2 — same address on every chain. */
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/** V4 dynamic-fee flag — required when the tax module is enabled. */
export const DYNAMIC_FEE_FLAG = 0x800000;
