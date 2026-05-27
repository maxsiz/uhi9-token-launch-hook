// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TokenLaunchHookTestBase} from "./utils/TokenLaunchHookTestBase.sol";

import {MechanismConfig} from "../src/lib/MechanismConfig.sol";
import {GovernanceModule} from "../src/mechanisms/GovernanceModule.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Governance lifecycle against the assembled hook: setters are direct external calls, so
///         their reverts are NOT wrapped by PoolManager and can be asserted precisely.
contract TokenLaunchHookGovernanceTest is TokenLaunchHookTestBase {
    function _launchWithTax() internal returns (PoolId pid) {
        (pid,) = _launch(_config(_enabled(false, true, false, false)), _dynamicKey());
    }

    function test_govSetter_byNFTOwner_succeeds() public {
        PoolId pid = _launchWithTax();

        vm.prank(deployer);
        launchHook.setBuyTaxOverride(pid, 20_000);

        // At launch time decayed buy tax = 30000; override caps it to 20000.
        assertEq(launchHook.effectiveBuyTaxOf(pid), 20_000);
    }

    function test_govSetter_byNonOwner_reverts() public {
        PoolId pid = _launchWithTax();

        vm.prank(trader);
        vm.expectRevert(GovernanceModule.NotGovernanceOwner.selector);
        launchHook.setBuyTaxOverride(pid, 20_000);
    }

    function test_govSetter_onlyLowers() public {
        PoolId pid = _launchWithTax();

        vm.prank(deployer);
        launchHook.setBuyTaxOverride(pid, 20_000);
        vm.prank(deployer);
        vm.expectRevert(); // CanOnlyLowerTax (BuySellTaxMechanism)
        launchHook.setBuyTaxOverride(pid, 25_000);
    }

    function test_govNFTTransfer_movesControl() public {
        PoolId pid = _launchWithTax();
        uint256 govTokenId = launchHook.governanceTokenIdOf(pid);

        // Transfer the governance NFT from the deployer to the trader.
        vm.prank(deployer);
        IERC721(address(lpm)).transferFrom(deployer, trader, govTokenId);

        assertEq(launchHook.governanceOwnerOf(pid), trader);

        // Old owner loses control; new owner gains it.
        vm.prank(deployer);
        vm.expectRevert(GovernanceModule.NotGovernanceOwner.selector);
        launchHook.setBuyTaxOverride(pid, 20_000);

        vm.prank(trader);
        launchHook.setBuyTaxOverride(pid, 10_000);
        assertEq(launchHook.effectiveBuyTaxOf(pid), 10_000);
    }

    function test_phaseFreezes_afterLaunchEnd() public {
        PoolId pid = _launchWithTax();

        assertEq(launchHook.launchPhaseOf(pid), 1); // Active
        vm.warp(block.timestamp + LAUNCH_DURATION); // reach launchEndTime
        assertEq(launchHook.launchPhaseOf(pid), 2); // Frozen

        vm.prank(deployer);
        vm.expectRevert(GovernanceModule.LaunchEnded.selector);
        launchHook.setBuyTaxOverride(pid, 20_000);
    }
}
