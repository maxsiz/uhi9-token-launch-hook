// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {WhitelistPhaseMechanism} from "../../src/mechanisms/WhitelistPhaseMechanism.sol";
import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";
import {WhitelistPhaseHarness} from "../utils/WhitelistPhaseHarness.sol";
import {MockPositionManager} from "../utils/MockPositionManager.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

contract WhitelistPhaseMechanismTest is Test {
    MockPositionManager internal posm;
    WhitelistPhaseHarness internal h;

    PoolId internal pid = PoolId.wrap(keccak256("pool"));

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice"); // governance NFT owner
    address internal bob = makeAddr("bob"); // whitelisted trader
    address internal carol = makeAddr("carol"); // non-whitelisted

    uint64 internal constant LAUNCH_DURATION = 30 days;

    uint64 internal launchTime;
    uint64 internal launchEndTime;
    uint64 internal whitelistEnd;

    function setUp() public {
        posm = new MockPositionManager();
        h = new WhitelistPhaseHarness(address(posm));
        vm.warp(1000);
        launchTime = uint64(block.timestamp);
        launchEndTime = launchTime + LAUNCH_DURATION;
        whitelistEnd = launchTime + 10 days; // within (launchTime, launchEndTime]
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function _cfg(uint64 endTime) internal pure returns (WhitelistPhaseMechanism.WhitelistPhaseConfig memory) {
        return WhitelistPhaseMechanism.WhitelistPhaseConfig({whitelistEndTime: endTime});
    }

    function _params(uint256 tokenId) internal pure returns (ModifyLiquidityParams memory) {
        return ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 1e18, salt: bytes32(tokenId)});
    }

    function _bootstrapGov() internal {
        uint256 tokenId = posm.mint(alice);
        GovernanceModule.GovernanceInitConfig memory gcfg = GovernanceModule.GovernanceInitConfig({
            deployer: deployer, launchDuration: LAUNCH_DURATION, tokenIsCurrency0: true
        });
        h.initGovernance(pid, _params(tokenId), gcfg, address(posm));
    }

    /// @notice Bootstrap governance, init whitelist, and whitelist bob.
    function _setup() internal {
        _bootstrapGov();
        h.initWhitelist(pid, _cfg(whitelistEnd), launchTime, launchEndTime);
        vm.prank(alice);
        h.addToWhitelist(pid, bob);
    }

    // -------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------

    function test_init_storesConfig_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit WhitelistPhaseMechanism.WhitelistPhaseInitialized(pid, whitelistEnd);
        h.initWhitelist(pid, _cfg(whitelistEnd), launchTime, launchEndTime);
        assertEq(h.whitelistConfigOf(pid).whitelistEndTime, whitelistEnd);
    }

    function test_init_endTimeAtOrBeforeLaunchTime_reverts() public {
        vm.expectRevert(WhitelistPhaseMechanism.InvalidWhitelistEndTime.selector);
        h.initWhitelist(pid, _cfg(launchTime), launchTime, launchEndTime);
    }

    function test_init_endTimeAfterLaunchEnd_reverts() public {
        vm.expectRevert(WhitelistPhaseMechanism.InvalidWhitelistEndTime.selector);
        h.initWhitelist(pid, _cfg(launchEndTime + 1), launchTime, launchEndTime);
    }

    // -------------------------------------------------------------------
    // Access during the window
    // -------------------------------------------------------------------

    function test_whitelisted_canBuy() public {
        _setup();
        h.checkSwap(pid, bob);
    }

    function test_whitelisted_canSell() public {
        _setup();
        h.checkSwap(pid, bob); // whitelist gates both directions identically
    }

    function test_whitelisted_canAddLiquidity() public {
        _setup();
        h.checkAddLiquidity(pid, bob);
    }

    function test_nonWhitelisted_cannotBuy() public {
        _setup();
        vm.expectRevert(WhitelistPhaseMechanism.NotWhitelisted.selector);
        h.checkSwap(pid, carol);
    }

    function test_nonWhitelisted_cannotSell() public {
        _setup();
        vm.expectRevert(WhitelistPhaseMechanism.NotWhitelisted.selector);
        h.checkSwap(pid, carol);
    }

    function test_nonWhitelisted_cannotAddLiquidity() public {
        _setup();
        vm.expectRevert(WhitelistPhaseMechanism.NotWhitelisted.selector);
        h.checkAddLiquidity(pid, carol);
    }

    function test_nonWhitelisted_canAlwaysRemoveLiquidity() public {
        _setup();
        // W11: removal is never gated, even for a non-whitelisted address during the window.
        h.checkRemove(pid, carol);
    }

    function test_afterEndTime_unrestricted_evenNonWhitelisted() public {
        _setup();
        vm.warp(whitelistEnd); // window expired
        h.checkSwap(pid, carol);
        h.checkAddLiquidity(pid, carol);
    }

    function test_bootstrap_skipsWhitelistCheck() public {
        // Governance not yet initialized → bootstrap (deployer's first mint) is not gated.
        h.initWhitelist(pid, _cfg(whitelistEnd), launchTime, launchEndTime);
        h.checkAddLiquidity(pid, carol); // no revert despite carol not being whitelisted
    }

    // -------------------------------------------------------------------
    // Whitelist management
    // -------------------------------------------------------------------

    function test_addToWhitelist_byOwner_succeeds_emitsEvent() public {
        _bootstrapGov();
        h.initWhitelist(pid, _cfg(whitelistEnd), launchTime, launchEndTime);
        vm.expectEmit(true, true, false, false);
        emit WhitelistPhaseMechanism.AddressWhitelisted(pid, bob);
        vm.prank(alice);
        h.addToWhitelist(pid, bob);
        assertTrue(h.isAddressWhitelisted(pid, bob));
    }

    function test_addManyToWhitelist_batch_emitsEvents() public {
        _bootstrapGov();
        h.initWhitelist(pid, _cfg(whitelistEnd), launchTime, launchEndTime);
        address[] memory users = new address[](2);
        users[0] = bob;
        users[1] = carol;

        vm.recordLogs();
        vm.prank(alice);
        h.addManyToWhitelist(pid, users);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertTrue(h.isAddressWhitelisted(pid, bob));
        assertTrue(h.isAddressWhitelisted(pid, carol));
    }

    function test_removeFromWhitelist_byOwner_succeeds_emitsEvent() public {
        _setup(); // bob whitelisted
        vm.expectEmit(true, true, false, false);
        emit WhitelistPhaseMechanism.AddressUnwhitelisted(pid, bob);
        vm.prank(alice);
        h.removeFromWhitelist(pid, bob);
        assertFalse(h.isAddressWhitelisted(pid, bob));
    }

    function test_removeManyFromWhitelist_batch_emitsEvents() public {
        _bootstrapGov();
        h.initWhitelist(pid, _cfg(whitelistEnd), launchTime, launchEndTime);
        address[] memory users = new address[](2);
        users[0] = bob;
        users[1] = carol;
        vm.prank(alice);
        h.addManyToWhitelist(pid, users);

        vm.recordLogs();
        vm.prank(alice);
        h.removeManyFromWhitelist(pid, users);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertFalse(h.isAddressWhitelisted(pid, bob));
        assertFalse(h.isAddressWhitelisted(pid, carol));
    }

    function test_addToWhitelist_byNonOwner_reverts() public {
        _setup();
        vm.prank(carol);
        vm.expectRevert(GovernanceModule.NotGovernanceOwner.selector);
        h.addToWhitelist(pid, carol);
    }

    function test_relaxEndTime_byOwner_succeeds() public {
        _setup();
        uint64 newEnd = launchTime + 5 days; // earlier than current (10d)
        vm.prank(alice);
        h.relaxWhitelistEndTime(pid, newEnd);
        assertEq(h.whitelistConfigOf(pid).whitelistEndTime, newEnd);
    }

    function test_relaxEndTime_laterThanCurrent_reverts() public {
        _setup();
        vm.prank(alice);
        vm.expectRevert(WhitelistPhaseMechanism.CanOnlyRelax.selector);
        h.relaxWhitelistEndTime(pid, launchTime + 20 days);
    }
}
