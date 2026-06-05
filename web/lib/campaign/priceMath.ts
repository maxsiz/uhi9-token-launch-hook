/**
 * Human inputs (price + seed amounts + range) → on-chain mint params, via the Uniswap v4 SDK.
 *
 * SCAFFOLD: the public shape is final; the v4-sdk body is left as a clearly-marked TODO so the
 * scaffold type-checks without pulling the SDK into the first build. Implement with
 * `@uniswap/v4-sdk` (Pool, Position, TickMath, nearestUsableTick) + `@uniswap/sdk-core`
 * (Token, Ether) per DESIGN.md §4.2.
 */

export interface MintMathInput {
  /** price = pair per 1 token, human units */
  price: number;
  amountTokenWei: bigint;
  amountPairWei: bigint;
  tickSpacing: number;
  /** range half-width in ticks around the current tick; undefined ⇒ full range */
  rangeTicks?: number;
}

export interface MintMathOutput {
  sqrtPriceInit: bigint;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
}

/**
 * @throws not-implemented in the scaffold. Wire the v4-sdk here.
 */
export function computeMintParams(input: MintMathInput): MintMathOutput {
  // Example of the intended SDK usage (kept minimal so imports stay live):
  //   const sqrt = encodeSqrtRatioX96(amount1, amount0);
  //   const tick = TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrt.toString()));
  //   const tickLower = nearestUsableTick(tick - range, tickSpacing);
  //   const pool = new Pool(token0, token1, fee, sqrt, 0, tick);
  //   const pos  = Position.fromAmounts({ pool, tickLower, tickUpper, amount0, amount1, useFullPrecision: true });
  //   liquidity = BigInt(pos.liquidity.toString()); mintAmounts → amountMax (+ slippage)
  void input;
  throw new Error("priceMath.computeMintParams: TODO — implement with @uniswap/v4-sdk (DESIGN.md §4.2)");
}
