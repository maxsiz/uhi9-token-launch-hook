// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {PoolMath} from "../../src/lib/PoolMath.sol";

contract PoolMathTest is Test {
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336; // 2^96

    // ── sqrtPriceX96From ──

    function test_sqrtPrice_oneToOne() public pure {
        assertEq(PoolMath.sqrtPriceX96From(1e18, 1e18), SQRT_PRICE_1_1);
    }

    /// External wrapper so `vm.expectRevert` sees a sub-call (internal lib calls are inlined).
    function callSqrt(uint256 amount1, uint256 amount0) external pure returns (uint160) {
        return PoolMath.sqrtPriceX96From(amount1, amount0);
    }

    function test_sqrtPrice_revertsOnZero() public {
        vm.expectRevert(PoolMath.AmountZero.selector);
        this.callSqrt(0, 1e18);
    }

    function test_sqrtPrice_revertsOnZeroDenominator() public {
        vm.expectRevert(PoolMath.AmountZero.selector);
        this.callSqrt(1e18, 0);
    }

    /// price(amount1, amount0) and its reciprocal sit on opposite sides of 1:1.
    function test_sqrtPrice_orientationReciprocal() public pure {
        uint160 low = PoolMath.sqrtPriceX96From(1e18, 100_000e18); // amount1 << amount0
        uint160 high = PoolMath.sqrtPriceX96From(100_000e18, 1e18); // amount1 >> amount0
        assertLt(low, SQRT_PRICE_1_1);
        assertGt(high, SQRT_PRICE_1_1);
    }

    /// More currency1 per currency0 ⇒ higher (never lower) price.
    function testFuzz_sqrtPrice_monotonicInAmount1(uint256 a0, uint256 a1, uint256 a1b) public pure {
        a0 = bound(a0, 1e15, 1e21);
        a1 = bound(a1, 1e15, 1e21);
        a1b = bound(a1b, a1, 1e21);
        assertGe(PoolMath.sqrtPriceX96From(a1b, a0), PoolMath.sqrtPriceX96From(a1, a0));
    }

    // ── alignRange ──

    function test_alignRange_fullRangeWhenZero() public pure {
        (int24 lo, int24 hi) = PoolMath.alignRange(0, 0, 60);
        assertEq(lo, TickMath.minUsableTick(60));
        assertEq(hi, TickMath.maxUsableTick(60));
    }

    function test_alignRange_bracketsAndAligned() public pure {
        int24 spacing = 60;
        (int24 lo, int24 hi) = PoolMath.alignRange(1234, 6000, spacing);
        assertEq(lo % spacing, 0, "lo not aligned");
        assertEq(hi % spacing, 0, "hi not aligned");
        assertLe(lo, 1234, "lo above price");
        assertGe(hi, 1234, "hi below price");
        assertLt(lo, hi, "empty range");
    }

    function testFuzz_alignRange_validAndAligned(int256 curIn, int256 rangeIn) public pure {
        int24 spacing = 60;
        int24 cur = int24(bound(curIn, TickMath.MIN_TICK + 70_000, TickMath.MAX_TICK - 70_000));
        int24 range = int24(bound(rangeIn, spacing, 60_000));
        (int24 lo, int24 hi) = PoolMath.alignRange(cur, range, spacing);
        assertEq(lo % spacing, 0);
        assertEq(hi % spacing, 0);
        assertLt(lo, hi);
        assertGe(lo, TickMath.minUsableTick(spacing));
        assertLe(hi, TickMath.maxUsableTick(spacing));
    }
}
