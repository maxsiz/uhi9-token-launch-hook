// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TokenLaunchHookTestBase} from "./utils/TokenLaunchHookTestBase.sol";

import {MechanismConfig} from "../src/lib/MechanismConfig.sol";
import {BuySellTaxMechanism} from "../src/mechanisms/BuySellTaxMechanism.sol";

import {PositionConfig} from "@uniswap/v4-periphery/test/shared/PositionConfig.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

contract TokenLaunchHookIntegrationTest is TokenLaunchHookTestBase {
    // -------------------------------------------------------------------
    // Bootstrap
    // -------------------------------------------------------------------

    function test_launch_bootstrapsCampaign_capturesGovNFT() public {
        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(true, true, true, true));
        (PoolId pid, uint256 govTokenId) = _launch(cfg, _dynamicKey());

        assertEq(launchHook.governanceTokenIdOf(pid), govTokenId);
        assertEq(launchHook.governanceOwnerOf(pid), deployer);
        assertEq(launchHook.launchPhaseOf(pid), 1); // Active

        (bool antiSnipe, bool tax, bool lock, bool whitelist) = launchHook.enabled(pid);
        assertTrue(antiSnipe);
        assertTrue(tax);
        assertTrue(lock);
        assertTrue(whitelist);
    }

    function test_launch_wrongInitPrice_reverts() public {
        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(false, false, false, false));
        cfg.expectedInitialSqrtPrice = SQRT_PRICE_1_1 + 1; // mismatch vs actual init price

        PoolKey memory key = _dynamicKey();
        manager.initialize(key, SQRT_PRICE_1_1);
        PositionConfig memory pc = PositionConfig({poolKey: key, tickLower: -600, tickUpper: 600});

        // PoolManager wraps hook reverts in CustomRevert.WrappedError; the inner reason here is
        // TokenLaunchHook.WrongInitPrice (asserted precisely at the unit level).
        vm.prank(deployer, deployer);
        vm.expectRevert();
        mint(pc, SEED_LIQUIDITY, deployer, MechanismConfig.encode(cfg));
    }

    function test_launch_taxOnStaticFee_reverts() public {
        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(false, true, false, false));

        PoolKey memory key = _staticKey(); // non-dynamic fee
        manager.initialize(key, SQRT_PRICE_1_1);
        PositionConfig memory pc = PositionConfig({poolKey: key, tickLower: -600, tickUpper: 600});

        // Inner reason: TokenLaunchHook.TaxRequiresDynamicFee (wrapped by PoolManager).
        vm.prank(deployer, deployer);
        vm.expectRevert();
        mint(pc, SEED_LIQUIDITY, deployer, MechanismConfig.encode(cfg));
    }

    // -------------------------------------------------------------------
    // Swap-time modules
    // -------------------------------------------------------------------

    function test_swap_appliesDynamicTax() public {
        (PoolId pid,) = _launch(_config(_enabled(false, true, false, false)), _dynamicKey());
        _fundTrader(trader);

        // Buy (zeroForOne == false) → isBuy true → initial buy tax (3%).
        vm.expectEmit(true, true, false, true, address(launchHook));
        emit BuySellTaxMechanism.TaxApplied(pid, trader, true, 30_000);
        vm.prank(trader, trader);
        swap(_dynamicKey(), false, -0.1 ether, "");
    }

    function test_swap_antiSnipe_blocksLargeBuy() public {
        _launch(_config(_enabled(true, false, false, false)), _dynamicKey());
        _fundTrader(trader);

        // maxBuyAmountIn == 1 ether; a 2 ether buy must be rejected during the window.
        // Inner reason: AntiSnipeMechanism.BuyTooLarge (wrapped by PoolManager).
        vm.prank(trader, trader);
        vm.expectRevert();
        swap(_dynamicKey(), false, -2 ether, "");
    }

    function test_swap_antiSnipe_allowsSmallBuy() public {
        _launch(_config(_enabled(true, false, false, false)), _dynamicKey());
        _fundTrader(trader);

        vm.prank(trader, trader);
        swap(_dynamicKey(), false, -0.5 ether, ""); // within cap
    }

    // -------------------------------------------------------------------
    // Liquidity lock on the governance NFT
    // -------------------------------------------------------------------

    function test_removeLiquidity_govNFT_blockedThenAllowed() public {
        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(false, false, true, false));
        (, uint256 govTokenId) = _launch(cfg, _dynamicKey());

        PositionConfig memory pc = PositionConfig({poolKey: _dynamicKey(), tickLower: -600, tickUpper: 600});

        // During the active phase the governance NFT cannot be decreased (G3).
        // Inner reason: GovernanceModule.CannotBurnGovernanceNFT (wrapped by PoolManager).
        vm.prank(deployer, deployer);
        vm.expectRevert();
        decreaseLiquidity(govTokenId, pc, SEED_LIQUIDITY / 2, "");

        // After launchEnd (== M3 unlockTime), removal is allowed.
        vm.warp(block.timestamp + LAUNCH_DURATION + 1);
        _deadline = block.timestamp + 1; // refresh the LiquidityOperations deadline after warping
        vm.prank(deployer, deployer);
        decreaseLiquidity(govTokenId, pc, SEED_LIQUIDITY / 2, "");
    }
}
