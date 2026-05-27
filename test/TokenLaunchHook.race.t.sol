// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TokenLaunchHookTestBase} from "./utils/TokenLaunchHookTestBase.sol";

import {MechanismConfig} from "../src/lib/MechanismConfig.sol";

import {PositionConfig} from "@uniswap/v4-periphery/test/shared/PositionConfig.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice Anti-sandwich: only the deployer's own transaction may seed the launch (first mint).
contract TokenLaunchHookRaceTest is TokenLaunchHookTestBase {
    function test_foreignFirstMint_reverts() public {
        // A would-be sandwicher funds itself and tries to be the first LP.
        seedBalance(trader);
        approvePosmFor(trader);

        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(false, false, false, false));
        // cfg.deployer stays = deployer, but the trader (tx.origin) attempts the first mint.
        PoolKey memory key = _dynamicKey();
        manager.initialize(key, SQRT_PRICE_1_1);
        PositionConfig memory pc = PositionConfig({poolKey: key, tickLower: -600, tickUpper: 600});

        // Inner reason: TokenLaunchHook.WrongFirstLP (wrapped by PoolManager).
        vm.prank(trader, trader);
        vm.expectRevert();
        mint(pc, SEED_LIQUIDITY, trader, MechanismConfig.encode(cfg));
    }

    function test_deployerFirstMint_succeeds() public {
        (PoolId pid, uint256 govTokenId) = _launch(_config(_enabled(false, false, false, false)), _dynamicKey());
        assertEq(launchHook.governanceTokenIdOf(pid), govTokenId);
        assertEq(launchHook.governanceOwnerOf(pid), deployer);
    }
}
