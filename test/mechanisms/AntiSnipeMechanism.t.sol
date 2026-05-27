// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {AntiSnipeMechanism} from "../../src/mechanisms/AntiSnipeMechanism.sol";
import {AntiSnipeHarness} from "../utils/AntiSnipeHarness.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

contract AntiSnipeMechanismTest is Test {
    AntiSnipeHarness internal h;

    PoolId internal pid = PoolId.wrap(keccak256("pool"));

    // Launched token is currency0 → BUY is zeroForOne == false.
    bool internal constant TOKEN_IS_C0 = true;
    bool internal constant BUY = false;
    bool internal constant SELL = true;

    uint32 internal constant WINDOW = 1 hours;
    uint128 internal constant MAX_BUY = 1 ether;

    uint64 internal launchTime;

    function setUp() public {
        h = new AntiSnipeHarness();
        vm.warp(1000);
        launchTime = uint64(block.timestamp);
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function _cfg(uint32 duration, uint128 maxBuy) internal pure returns (AntiSnipeMechanism.AntiSnipeConfig memory) {
        return AntiSnipeMechanism.AntiSnipeConfig({antiSnipeDuration: duration, maxBuyAmountIn: maxBuy});
    }

    function _swap(bool zeroForOne, int256 amountSpecified) internal pure returns (SwapParams memory) {
        return SwapParams({zeroForOne: zeroForOne, amountSpecified: amountSpecified, sqrtPriceLimitX96: 0});
    }

    // -------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------

    function test_init_storesConfig_emitsEvent() public {
        AntiSnipeMechanism.AntiSnipeConfig memory cfg = _cfg(WINDOW, MAX_BUY);

        vm.expectEmit(true, false, false, true);
        emit AntiSnipeMechanism.AntiSnipeInitialized(pid, cfg);
        h.initAntiSnipe(pid, cfg);

        AntiSnipeMechanism.AntiSnipeConfig memory stored = h.antiSnipeConfigOf(pid);
        assertEq(stored.antiSnipeDuration, WINDOW);
        assertEq(stored.maxBuyAmountIn, MAX_BUY);
    }

    function test_init_durationExceedsMax_reverts() public {
        vm.expectRevert(AntiSnipeMechanism.InvalidAntiSnipeDuration.selector);
        h.initAntiSnipe(pid, _cfg(uint32(1 days) + 1, MAX_BUY));
    }

    // -------------------------------------------------------------------
    // Check
    // -------------------------------------------------------------------

    function test_disabled_skipsCheck() public {
        h.initAntiSnipe(pid, _cfg(0, 0)); // disabled
        // Even a huge buy passes when the mechanism is disabled.
        h.checkAntiSnipe(pid, _swap(BUY, -int256(1000 ether)), TOKEN_IS_C0, launchTime);
    }

    function test_buy_withinLimits_passes() public {
        h.initAntiSnipe(pid, _cfg(WINDOW, MAX_BUY));
        h.checkAntiSnipe(pid, _swap(BUY, -int256(0.5 ether)), TOKEN_IS_C0, launchTime);
    }

    function test_buy_exceedsMaxAmount_reverts() public {
        h.initAntiSnipe(pid, _cfg(WINDOW, MAX_BUY));
        vm.expectRevert(AntiSnipeMechanism.BuyTooLarge.selector);
        h.checkAntiSnipe(pid, _swap(BUY, -int256(2 ether)), TOKEN_IS_C0, launchTime);
    }

    function test_buy_exactOut_reverts() public {
        h.initAntiSnipe(pid, _cfg(WINDOW, MAX_BUY));
        // amountSpecified > 0 means exact-output — disallowed for buys in-window.
        vm.expectRevert(AntiSnipeMechanism.ExactOutNotAllowedDuringAntiSnipe.selector);
        h.checkAntiSnipe(pid, _swap(BUY, int256(0.5 ether)), TOKEN_IS_C0, launchTime);
    }

    function test_sell_unrestricted_duringWindow() public {
        h.initAntiSnipe(pid, _cfg(WINDOW, MAX_BUY));
        // Sells are never restricted — neither size nor exact-out matters.
        h.checkAntiSnipe(pid, _swap(SELL, -int256(1000 ether)), TOKEN_IS_C0, launchTime);
        h.checkAntiSnipe(pid, _swap(SELL, int256(1000 ether)), TOKEN_IS_C0, launchTime);
    }

    function test_buy_afterWindowExpires_unrestricted() public {
        h.initAntiSnipe(pid, _cfg(WINDOW, MAX_BUY));
        vm.warp(launchTime + WINDOW); // window expired (>=)
        h.checkAntiSnipe(pid, _swap(BUY, -int256(1000 ether)), TOKEN_IS_C0, launchTime);
    }
}
