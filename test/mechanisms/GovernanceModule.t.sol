// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";
import {GovernanceHarness} from "../utils/GovernanceHarness.sol";
import {MockPositionManager} from "../utils/MockPositionManager.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

contract GovernanceModuleTest is Test {
    MockPositionManager internal posm;
    GovernanceHarness internal gov;

    PoolId internal pid = PoolId.wrap(keccak256("pool"));

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice"); // initial governance NFT owner
    address internal bob = makeAddr("bob");

    uint64 internal constant DURATION = 7 days;
    uint64 internal launchTime;

    function setUp() public {
        posm = new MockPositionManager();
        gov = new GovernanceHarness(address(posm));
        vm.warp(1000); // avoid timestamp 0/underflow corner cases
        launchTime = uint64(block.timestamp);
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function _params(uint256 tokenId) internal pure returns (ModifyLiquidityParams memory) {
        return ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 1e18, salt: bytes32(tokenId)});
    }

    function _cfg(uint64 duration) internal view returns (GovernanceModule.GovernanceInitConfig memory) {
        return
            GovernanceModule.GovernanceInitConfig({
                deployer: deployer, launchDuration: duration, tokenIsCurrency0: true
            });
    }

    /// @notice Mint a position to `nftOwner` and bootstrap governance from the PositionManager.
    function _bootstrap(address nftOwner, uint64 duration) internal returns (uint256 tokenId) {
        tokenId = posm.mint(nftOwner);
        gov.initGovernance(pid, _params(tokenId), _cfg(duration), address(posm));
    }

    // -------------------------------------------------------------------
    // Bootstrap / init
    // -------------------------------------------------------------------

    function test_init_bootstrap_capturesGovNFT_emitsEvent() public {
        uint256 tokenId = posm.mint(alice);

        vm.expectEmit(true, true, false, true);
        emit GovernanceModule.CampaignBootstrapped(pid, deployer, tokenId, launchTime, launchTime + DURATION);
        gov.initGovernance(pid, _params(tokenId), _cfg(DURATION), address(posm));

        assertEq(gov.governanceTokenIdOf(pid), tokenId);
        assertEq(gov.governanceOwnerOf(pid), alice);
        assertEq(gov.launchPhaseOf(pid), 1);
    }

    function test_governanceInfoOf_returnsFullState() public {
        uint256 tokenId = _bootstrap(alice, DURATION);

        GovernanceModule.GovernanceState memory s = gov.governanceInfoOf(pid);
        assertEq(s.tokenId, tokenId);
        assertEq(s.launchTime, launchTime);
        assertEq(s.launchEndTime, launchTime + DURATION);
        assertTrue(s.initialized);
        assertTrue(s.tokenIsCurrency0);
        assertEq(s.deployer, deployer);
    }

    function test_governanceInfoOf_uninitialized_isZero() public view {
        GovernanceModule.GovernanceState memory s = gov.governanceInfoOf(PoolId.wrap(keccak256("never")));
        assertFalse(s.initialized);
        assertEq(s.tokenId, 0);
        assertEq(s.launchEndTime, 0);
        assertEq(s.deployer, address(0));
    }

    function test_init_nonPosM_reverts() public {
        uint256 tokenId = posm.mint(alice);
        vm.expectRevert(GovernanceModule.MustUsePositionManager.selector);
        gov.initGovernance(pid, _params(tokenId), _cfg(DURATION), address(0xBAD));
    }

    function test_init_duplicate_reverts() public {
        _bootstrap(alice, DURATION);
        uint256 second = posm.mint(bob);
        vm.expectRevert(GovernanceModule.AlreadyInitialized.selector);
        gov.initGovernance(pid, _params(second), _cfg(DURATION), address(posm));
    }

    function test_init_durationTooShort_reverts() public {
        uint256 tokenId = posm.mint(alice);
        vm.expectRevert(GovernanceModule.InvalidLaunchDuration.selector);
        gov.initGovernance(pid, _params(tokenId), _cfg(uint64(1 days) - 1), address(posm));
    }

    function test_init_durationTooLong_reverts() public {
        uint256 tokenId = posm.mint(alice);
        vm.expectRevert(GovernanceModule.InvalidLaunchDuration.selector);
        gov.initGovernance(pid, _params(tokenId), _cfg(uint64(365 days) + 1), address(posm));
    }

    // -------------------------------------------------------------------
    // onlyGovernance modifier
    // -------------------------------------------------------------------

    function test_onlyGovernance_correctOwner_passes() public {
        _bootstrap(alice, DURATION);
        vm.prank(alice);
        gov.bumpValue(pid, 42);
        assertEq(gov.lastValue(), 42);
    }

    function test_onlyGovernance_wrongCaller_reverts() public {
        _bootstrap(alice, DURATION);
        vm.prank(bob);
        vm.expectRevert(GovernanceModule.NotGovernanceOwner.selector);
        gov.bumpValue(pid, 42);
    }

    function test_onlyGovernance_uninitialized_reverts() public {
        vm.prank(alice);
        vm.expectRevert(GovernanceModule.NotInitialized.selector);
        gov.bumpValue(pid, 42);
    }

    function test_onlyGovernance_postLaunchEnd_reverts() public {
        _bootstrap(alice, DURATION);
        vm.warp(launchTime + DURATION); // launchEndTime reached → Frozen
        vm.prank(alice);
        vm.expectRevert(GovernanceModule.LaunchEnded.selector);
        gov.bumpValue(pid, 42);
    }

    function test_onlyGovernance_afterNFTTransfer_newOwnerHasAccess() public {
        uint256 tokenId = _bootstrap(alice, DURATION);
        posm.transfer(tokenId, bob);

        vm.prank(bob);
        gov.bumpValue(pid, 7);
        assertEq(gov.lastValue(), 7);

        vm.prank(alice);
        vm.expectRevert(GovernanceModule.NotGovernanceOwner.selector);
        gov.bumpValue(pid, 9);
    }

    // -------------------------------------------------------------------
    // Burn protection
    // -------------------------------------------------------------------

    function test_burnProtection_govNFT_inPhase1_reverts() public {
        uint256 tokenId = _bootstrap(alice, DURATION);
        vm.expectRevert(GovernanceModule.CannotBurnGovernanceNFT.selector);
        gov.checkBurnProtection(pid, _params(tokenId));
    }

    function test_burnProtection_govNFT_inPhase2_allows() public {
        uint256 tokenId = _bootstrap(alice, DURATION);
        vm.warp(launchTime + DURATION);
        gov.checkBurnProtection(pid, _params(tokenId)); // no revert
    }

    function test_burnProtection_nonGovNFT_inPhase1_allows() public {
        _bootstrap(alice, DURATION); // gov tokenId == 1
        gov.checkBurnProtection(pid, _params(2)); // a different position — no revert
    }

    // -------------------------------------------------------------------
    // Lifecycle / capture ordering
    // -------------------------------------------------------------------

    function test_launchPhaseOf_returnsCorrectPhase() public {
        assertEq(gov.launchPhaseOf(pid), 0); // Pre-launch
        _bootstrap(alice, DURATION);
        assertEq(gov.launchPhaseOf(pid), 1); // Active
        vm.warp(launchTime + DURATION);
        assertEq(gov.launchPhaseOf(pid), 2); // Frozen
    }

    function test_multiplePositionsFirstMulticall_onlyFirstCapturesGov() public {
        uint256 first = posm.mint(alice); // tokenId 1
        uint256 second = posm.mint(bob); // tokenId 2

        gov.initGovernance(pid, _params(first), _cfg(DURATION), address(posm));

        // A second position in the same launch cannot re-capture governance.
        vm.expectRevert(GovernanceModule.AlreadyInitialized.selector);
        gov.initGovernance(pid, _params(second), _cfg(DURATION), address(posm));

        assertEq(gov.governanceTokenIdOf(pid), first);
        assertEq(gov.governanceOwnerOf(pid), alice);
    }
}
