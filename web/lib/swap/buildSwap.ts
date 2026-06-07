import { encodeAbiParameters, parseAbiParameters, type Address, type Hex } from "viem";
import type { PoolKeyStruct } from "./quote";

// Universal Router command byte for a v4 swap, and the v4 action bytes we plan.
const V4_SWAP_COMMAND: Hex = "0x10";
// SWAP_EXACT_IN_SINGLE (0x06) + SETTLE_ALL (0x0c) + TAKE_ALL (0x0f)
const ACTIONS: Hex = "0x060c0f";

// Param ABIs lifted verbatim from @uniswap/v4-sdk V4_BASE_ACTIONS_ABI_DEFINITION.
const SWAP_EXACT_IN_SINGLE_PARAMS = parseAbiParameters(
  "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"
);
const CURRENCY_AMOUNT_PARAMS = parseAbiParameters("address currency, uint256 amount");
const V4_SWAP_INPUT_PARAMS = parseAbiParameters("bytes actions, bytes[] params");

export interface BuildSwapInput {
  poolKey: PoolKeyStruct;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
}

export interface UniversalRouterCall {
  commands: Hex;
  inputs: Hex[];
  deadline: bigint;
  /** msg.value to forward — non-zero only when the input currency is native ETH (address(0)). */
  value: bigint;
}

/**
 * Encode a single-hop exact-input v4 swap for `UniversalRouter.execute(commands, inputs, deadline)`,
 * hand-built (no universal-router-sdk dependency) to match V4Planner's output:
 *   V4_SWAP → abi.encode(actions, [SWAP_EXACT_IN_SINGLE, SETTLE_ALL(input), TAKE_ALL(output)]).
 */
export function buildUniversalRouterSwap(input: BuildSwapInput): UniversalRouterCall {
  const { poolKey, zeroForOne, amountIn, amountOutMinimum, deadline } = input;
  const inputCurrency = (zeroForOne ? poolKey.currency0 : poolKey.currency1) as Address;
  const outputCurrency = (zeroForOne ? poolKey.currency1 : poolKey.currency0) as Address;

  const swapParam = encodeAbiParameters(SWAP_EXACT_IN_SINGLE_PARAMS, [
    { poolKey, zeroForOne, amountIn, amountOutMinimum, hookData: "0x" },
  ]);
  const settleParam = encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [inputCurrency, amountIn]);
  const takeParam = encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [outputCurrency, amountOutMinimum]);

  const v4Input = encodeAbiParameters(V4_SWAP_INPUT_PARAMS, [ACTIONS, [swapParam, settleParam, takeParam]]);

  const isNativeInput = inputCurrency === "0x0000000000000000000000000000000000000000";
  return { commands: V4_SWAP_COMMAND, inputs: [v4Input], deadline, value: isNativeInput ? amountIn : 0n };
}
