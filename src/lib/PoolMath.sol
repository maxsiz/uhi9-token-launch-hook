// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title PoolMath
/// @notice On-chain pool-pricing helpers for auto-priced launches: derive an initial sqrtPriceX96 from
///         seed amounts and align a tick range to spacing. Mirrors the frontend price math (v3-sdk
///         `encodeSqrtRatioX96(amount1, amount0)` + `nearestUsableTick`), so a launch can be priced
///         inside the launchCampaign call once token ordering is known.
library PoolMath {
    error AmountZero();

    /// @notice `sqrtPriceX96 = sqrt(amount1 * 2^192 / amount0)` — identical to v3-sdk
    ///         `encodeSqrtRatioX96(amount1, amount0)`. `amount0`/`amount1` are currency0/currency1 raw
    ///         seed amounts (decimals-agnostic, as v4 prices are).
    /// @dev Reverts (in FullMath) for prices so extreme the ratio exceeds uint256 — far outside any real
    ///      launch. The result still has to land in [MIN_SQRT_PRICE, MAX_SQRT_PRICE] for the pool init.
    function sqrtPriceX96From(uint256 amount1, uint256 amount0) internal pure returns (uint160) {
        if (amount0 == 0 || amount1 == 0) revert AmountZero();
        uint256 ratioX192 = FullMath.mulDiv(amount1, uint256(1) << 192, amount0);
        return uint160(Math.sqrt(ratioX192));
    }

    /// @notice Align a symmetric tick range around `currentTick` to `spacing`, clamped to usable bounds.
    ///         `rangeTicks == 0` ⇒ the widest aligned (full) range. The range always brackets the price.
    function alignRange(int24 currentTick, int24 rangeTicks, int24 spacing)
        internal
        pure
        returns (int24 lower, int24 upper)
    {
        int24 minT = TickMath.minUsableTick(spacing);
        int24 maxT = TickMath.maxUsableTick(spacing);
        if (rangeTicks == 0) return (minT, maxT);

        lower = _floor(currentTick - rangeTicks, spacing);
        upper = _ceil(currentTick + rangeTicks, spacing);
        if (lower < minT) lower = minT;
        if (upper > maxT) upper = maxT;

        // Degenerate inputs (tiny range near a bound) — fall back to a single-spacing bracket of the price.
        if (lower >= upper) {
            lower = _floor(currentTick, spacing);
            upper = lower + spacing;
            if (upper > maxT) {
                upper = maxT;
                lower = maxT - spacing;
            }
            if (lower < minT) lower = minT;
        }
    }

    /// @dev Round toward negative infinity to a multiple of `spacing`.
    function _floor(int24 tick, int24 spacing) private pure returns (int24) {
        int24 q = tick / spacing;
        if (tick < 0 && tick % spacing != 0) q -= 1;
        return q * spacing;
    }

    /// @dev Round toward positive infinity to a multiple of `spacing`.
    function _ceil(int24 tick, int24 spacing) private pure returns (int24) {
        int24 q = tick / spacing;
        if (tick > 0 && tick % spacing != 0) q += 1;
        return q * spacing;
    }
}
