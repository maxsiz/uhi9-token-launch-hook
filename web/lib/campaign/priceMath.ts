/**
 * Human seed inputs → on-chain mint params, via the Uniswap v4 SDK.
 *
 * Inputs are orientation-resolved: `amount0`/`amount1` are the desired seed amounts of currency0 /
 * currency1 (raw wei, currency0 = lower address) and their decimals. The implied price is
 * `amount1/amount0`, encoded as `sqrtPriceInit`. Liquidity + slippage-padded amount caps come from a
 * v4 `Position` over a range centered on the current tick (`Position.fromAmounts`).
 *
 * Note on launch orientation: for a freshly-minted factory token the address (hence currency0/1) is
 * unknown until deploy, so the launch flow must deploy the token first, then call this with the
 * resolved ordering. An existing-token launch already knows both addresses.
 */
import { Token, Percent } from "@uniswap/sdk-core";
import { encodeSqrtRatioX96, TickMath, nearestUsableTick } from "@uniswap/v3-sdk";
import { Pool, Position } from "@uniswap/v4-sdk";

export interface MintMathInput {
  amount0: bigint; // desired currency0 seed (raw wei)
  amount1: bigint; // desired currency1 seed (raw wei)
  decimals0: number;
  decimals1: number;
  tickSpacing: number;
  /** range half-width in ticks around the current tick; undefined ⇒ widest aligned range. */
  rangeTicks?: number;
  /** slippage applied to the amount caps (basis points; default 50 = 0.5%). */
  slippageBps?: number;
}

export interface MintMathOutput {
  sqrtPriceInit: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
}

// Dummy sorted tokens — only ordering + decimals matter for the sqrt/liquidity math, not the address.
const ADDR0 = "0x0000000000000000000000000000000000000001";
const ADDR1 = "0x0000000000000000000000000000000000000002";
const NO_HOOK = "0x0000000000000000000000000000000000000000";
const POOL_FEE_FOR_MATH = 3000; // fee doesn't affect sqrt/liquidity; a valid value is required for the entity

export function computeMintParams(input: MintMathInput): MintMathOutput {
  const { amount0, amount1, decimals0, decimals1, tickSpacing } = input;
  const slippageBps = input.slippageBps ?? 50;

  const sqrt = encodeSqrtRatioX96(amount1.toString(), amount0.toString());
  const currentTick = TickMath.getTickAtSqrtRatio(sqrt);

  const minTick = nearestUsableTick(TickMath.MIN_TICK, tickSpacing);
  const maxTick = nearestUsableTick(TickMath.MAX_TICK, tickSpacing);
  const half = input.rangeTicks;
  let tickLower = half == null ? minTick : nearestUsableTick(currentTick - half, tickSpacing);
  let tickUpper = half == null ? maxTick : nearestUsableTick(currentTick + half, tickSpacing);
  if (tickLower < minTick) tickLower = minTick;
  if (tickUpper > maxTick) tickUpper = maxTick;

  const token0 = new Token(1, ADDR0, decimals0);
  const token1 = new Token(1, ADDR1, decimals1);
  const pool = new Pool(token0, token1, POOL_FEE_FOR_MATH, tickSpacing, NO_HOOK, sqrt.toString(), "0", currentTick);

  const position = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: amount0.toString(),
    amount1: amount1.toString(),
    useFullPrecision: true,
  });

  const caps = position.mintAmountsWithSlippage(new Percent(slippageBps, 10_000));

  return {
    sqrtPriceInit: BigInt(sqrt.toString()),
    tickLower,
    tickUpper,
    liquidity: BigInt(position.liquidity.toString()),
    amount0Max: BigInt(caps.amount0.toString()),
    amount1Max: BigInt(caps.amount1.toString()),
  };
}
