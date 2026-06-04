// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {LiquidityLockMechanism} from "../../src/mechanisms/LiquidityLockMechanism.sol";
import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";
import {LiquidityLockHarness} from "../utils/LiquidityLockHarness.sol";
import {MockPositionManager} from "../utils/MockPositionManager.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

contract LiquidityLockMechanismTest is Test {
    MockPositionManager internal posm;
    LiquidityLockHarness internal h;

    PoolId internal pid = PoolId.wrap(keccak256("pool"));

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice"); // governance NFT owner

    bool internal constant TOKEN_IS_C0 = true; // launched token is currency0 → pair is amount1
    uint64 internal constant LAUNCH_DURATION = 30 days;
    uint128 internal constant THRESHOLD = 100 ether;
    uint256 internal constant GOV_ID = 1;

    uint64 internal launchTime;
    uint64 internal launchEndTime;

    function setUp() public {
        posm = new MockPositionManager();
        h = new LiquidityLockHarness(address(posm));
        vm.warp(1000);
        launchTime = uint64(block.timestamp);
        launchEndTime = launchTime + LAUNCH_DURATION;
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function _cfg(
        LiquidityLockMechanism.UnlockLogic logic,
        bool timeEn,
        bool volEn,
        uint64 unlockTime,
        uint128 threshold
    ) internal pure returns (LiquidityLockMechanism.LiquidityLockConfig memory) {
        return LiquidityLockMechanism.LiquidityLockConfig({
            logic: logic,
            timeEnabled: timeEn,
            volumeEnabled: volEn,
            unlockTime: unlockTime,
            unlockVolumeThreshold: threshold
        });
    }

    /// @notice AND, both conditions on: unlock at launchTime+60d AND THRESHOLD volume.
    function _defaultCfg() internal view returns (LiquidityLockMechanism.LiquidityLockConfig memory) {
        return _cfg(LiquidityLockMechanism.UnlockLogic.AND, true, true, launchTime + 60 days, THRESHOLD);
    }

    function _params(uint256 tokenId) internal pure returns (ModifyLiquidityParams memory) {
        return ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 1e18, salt: bytes32(tokenId)});
    }

    /// @notice Pair-side delta (amount1, since TOKEN_IS_C0).
    function _pairDelta(int128 pairAmt) internal pure returns (BalanceDelta) {
        return toBalanceDelta(int128(0), pairAmt);
    }

    function _bootstrapGov() internal {
        uint256 tokenId = posm.mint(alice); // GOV_ID == 1
        GovernanceModule.GovernanceInitConfig memory gcfg = GovernanceModule.GovernanceInitConfig({
            deployer: deployer, launchDuration: LAUNCH_DURATION, tokenIsCurrency0: TOKEN_IS_C0
        });
        h.initGovernance(pid, _params(tokenId), gcfg, address(posm));
    }

    /// @notice Bootstrap governance + init the default AND lock.
    function _setupDefault() internal {
        _bootstrapGov();
        h.initLock(pid, _defaultCfg(), launchEndTime);
    }

    // -------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------

    function test_init_storesConfig_emitsEvent() public {
        LiquidityLockMechanism.LiquidityLockConfig memory cfg = _defaultCfg();
        vm.expectEmit(true, false, false, true);
        emit LiquidityLockMechanism.LiquidityLockInitialized(pid, cfg);
        h.initLock(pid, cfg, launchEndTime);

        LiquidityLockMechanism.LiquidityLockConfig memory stored = h.lockConfigOf(pid);
        assertEq(uint8(stored.logic), uint8(LiquidityLockMechanism.UnlockLogic.AND));
        assertTrue(stored.timeEnabled);
        assertTrue(stored.volumeEnabled);
        assertEq(stored.unlockTime, launchTime + 60 days);
        assertEq(stored.unlockVolumeThreshold, THRESHOLD);
    }

    function test_init_noConditions_reverts() public {
        vm.expectRevert(LiquidityLockMechanism.NoConditionsEnabled.selector);
        h.initLock(pid, _cfg(LiquidityLockMechanism.UnlockLogic.AND, false, false, 0, 0), launchEndTime);
    }

    function test_init_unlockTimeBeforeLaunchEnd_reverts() public {
        vm.expectRevert(LiquidityLockMechanism.UnlockTimeBeforeLaunchEnd.selector);
        h.initLock(pid, _cfg(LiquidityLockMechanism.UnlockLogic.AND, true, false, launchEndTime - 1, 0), launchEndTime);
    }

    function test_init_volumeEnabledZeroThreshold_reverts() public {
        vm.expectRevert(LiquidityLockMechanism.NoConditionsEnabled.selector);
        h.initLock(pid, _cfg(LiquidityLockMechanism.UnlockLogic.AND, false, true, 0, 0), launchEndTime);
    }

    // -------------------------------------------------------------------
    // Volume tracking
    // -------------------------------------------------------------------

    function test_volumeAccumulates_inAfterSwap_bothDirections() public {
        h.initLock(pid, _defaultCfg(), launchEndTime);
        h.trackVolume(pid, toBalanceDelta(int128(60), int128(-50)), TOKEN_IS_C0); // |amount1| = 50
        h.trackVolume(pid, toBalanceDelta(int128(-30), int128(40)), TOKEN_IS_C0); // |amount1| = 40
        assertEq(h.cumulativeVolumeOf(pid), 90);
    }

    // --- L-2 regressions: short-circuit + saturating add ---

    /// Volume tracking is skipped entirely when the lock has no volume condition (no perpetual SSTORE).
    function test_volume_notTracked_whenVolumeDisabled() public {
        // Time-only lock: timeEnabled, volumeEnabled = false.
        h.initLock(pid, _cfg(LiquidityLockMechanism.UnlockLogic.AND, true, false, launchEndTime, 0), launchEndTime);
        h.trackVolume(pid, _pairDelta(int128(1_000)), TOKEN_IS_C0);
        assertEq(h.cumulativeVolumeOf(pid), 0, "volume tracked despite volumeEnabled=false");
    }

    /// Once the threshold is reached, accumulation stops (bounds growth → no perpetual SSTORE / overflow).
    function test_volume_stopsAccumulating_afterThresholdMet() public {
        h.initLock(pid, _defaultCfg(), launchEndTime); // THRESHOLD = 100 ether
        h.trackVolume(pid, _pairDelta(int128(uint128(THRESHOLD))), TOKEN_IS_C0); // exactly meets
        assertEq(h.cumulativeVolumeOf(pid), THRESHOLD);
        h.trackVolume(pid, _pairDelta(int128(50 ether)), TOKEN_IS_C0); // further volume ignored
        assertEq(h.cumulativeVolumeOf(pid), THRESHOLD, "kept accumulating past threshold");
    }

    /// The add saturates at type(uint128).max instead of reverting (an overflow in _afterSwap would DoS swaps).
    function test_volume_saturates_insteadOfOverflowRevert() public {
        // Threshold at max so the threshold short-circuit never fires before we test saturation.
        h.initLock(
            pid,
            _cfg(LiquidityLockMechanism.UnlockLogic.AND, true, true, launchEndTime, type(uint128).max),
            launchEndTime
        );
        int128 big = type(int128).max; // ~1.7e38 per track
        h.trackVolume(pid, _pairDelta(big), TOKEN_IS_C0);
        h.trackVolume(pid, _pairDelta(big), TOKEN_IS_C0); // cumulative ≈ 2^128 - 2, still < max
        h.trackVolume(pid, _pairDelta(big), TOKEN_IS_C0); // would overflow → must saturate, not revert
        assertEq(h.cumulativeVolumeOf(pid), type(uint128).max, "did not saturate at uint128 max");
    }

    // -------------------------------------------------------------------
    // Unlock logic
    // -------------------------------------------------------------------

    function test_isUnlocked_AND_bothMet_returnsTrue() public {
        h.initLock(
            pid, _cfg(LiquidityLockMechanism.UnlockLogic.AND, true, true, launchEndTime, THRESHOLD), launchEndTime
        );
        vm.warp(launchEndTime); // time met
        h.trackVolume(pid, _pairDelta(int128(THRESHOLD)), TOKEN_IS_C0); // volume met
        assertTrue(h.isUnlocked(pid));
    }

    function test_isUnlocked_AND_oneMet_returnsFalse() public {
        h.initLock(
            pid, _cfg(LiquidityLockMechanism.UnlockLogic.AND, true, true, launchEndTime, THRESHOLD), launchEndTime
        );
        vm.warp(launchEndTime); // time met, but volume == 0
        assertFalse(h.isUnlocked(pid));
    }

    function test_isUnlocked_OR_eitherMet_returnsTrue() public {
        h.initLock(
            pid, _cfg(LiquidityLockMechanism.UnlockLogic.OR, true, true, launchEndTime, THRESHOLD), launchEndTime
        );
        vm.warp(launchEndTime); // time met; volume still 0 → OR satisfied
        assertTrue(h.isUnlocked(pid));
    }

    function test_isUnlocked_neitherMet_returnsFalse() public {
        h.initLock(pid, _defaultCfg(), launchEndTime); // unlockTime = launchTime+60d
        // at launchTime: time not met, volume 0
        assertFalse(h.isUnlocked(pid));
    }

    // -------------------------------------------------------------------
    // Remove liquidity (G3 + M3 combined, governance NFT only)
    // -------------------------------------------------------------------

    function test_removeLiquidity_locked_reverts() public {
        _setupDefault();
        vm.warp(launchEndTime); // G3 passes (frozen), M3 still locked (time 60d unmet, volume 0)
        vm.expectRevert(LiquidityLockMechanism.LiquidityStillLocked.selector);
        h.beforeRemove(pid, _params(GOV_ID));
    }

    function test_removeLiquidity_unlocked_succeeds() public {
        _setupDefault();
        vm.warp(launchTime + 60 days); // time met (>= launchEnd, so G3 passes too)
        h.trackVolume(pid, _pairDelta(int128(THRESHOLD)), TOKEN_IS_C0); // volume met
        h.beforeRemove(pid, _params(GOV_ID)); // no revert
    }

    function test_removeLiquidity_beforeLaunchEnd_reverts() public {
        _bootstrapGov();
        // OR lock with volume met → M3 unlocked, yet G3 must still block before launchEnd.
        h.initLock(
            pid, _cfg(LiquidityLockMechanism.UnlockLogic.OR, true, true, launchTime + 60 days, THRESHOLD), launchEndTime
        );
        h.trackVolume(pid, _pairDelta(int128(THRESHOLD)), TOKEN_IS_C0);
        assertTrue(h.isUnlocked(pid)); // M3 satisfied
        vm.expectRevert(GovernanceModule.CannotBurnGovernanceNFT.selector); // G3 wins
        h.beforeRemove(pid, _params(GOV_ID));
    }

    function test_nonGovNFT_removeLiquidity_unrestricted() public {
        _setupDefault();
        // Before launchEnd and locked, but a non-governance position is unaffected.
        h.beforeRemove(pid, _params(2));
    }

    // -------------------------------------------------------------------
    // Governance relaxation
    // -------------------------------------------------------------------

    function test_relaxUnlockTime_byOwner_succeeds_emitsEvent() public {
        _setupDefault();
        uint64 newTime = launchTime + 45 days;
        vm.expectEmit(true, false, false, true);
        emit LiquidityLockMechanism.UnlockTimeRelaxed(pid, launchTime + 60 days, newTime);
        vm.prank(alice);
        h.relaxUnlockTime(pid, newTime);
        assertEq(h.lockConfigOf(pid).unlockTime, newTime);
    }

    function test_relaxUnlockTime_higherThanCurrent_reverts() public {
        _setupDefault();
        vm.prank(alice);
        vm.expectRevert(GovernanceModule.CanOnlyRelax.selector);
        h.relaxUnlockTime(pid, launchTime + 70 days);
    }

    function test_relaxUnlockVolume_byOwner_succeeds() public {
        _setupDefault();
        vm.prank(alice);
        h.relaxUnlockVolume(pid, 50 ether);
        assertEq(h.lockConfigOf(pid).unlockVolumeThreshold, 50 ether);
    }

    function test_disableTimeCondition_keepsVolumeActive() public {
        _setupDefault();
        vm.expectEmit(true, false, false, true);
        emit LiquidityLockMechanism.ConditionDisabled(pid, true);
        vm.prank(alice);
        h.disableTimeCondition(pid);

        LiquidityLockMechanism.LiquidityLockConfig memory cfg = h.lockConfigOf(pid);
        assertFalse(cfg.timeEnabled);
        assertTrue(cfg.volumeEnabled);
    }

    function test_disableLastCondition_reverts() public {
        _bootstrapGov();
        // Only volume enabled — disabling it would leave no condition.
        h.initLock(pid, _cfg(LiquidityLockMechanism.UnlockLogic.AND, false, true, 0, THRESHOLD), launchEndTime);
        vm.prank(alice);
        vm.expectRevert(LiquidityLockMechanism.MustKeepOneCondition.selector);
        h.disableVolumeCondition(pid);
    }

    function test_switchToOr_changesLogic_emitsEvent() public {
        _setupDefault(); // AND
        vm.expectEmit(true, false, false, true);
        emit LiquidityLockMechanism.LogicSwitchedToOr(pid);
        vm.prank(alice);
        h.switchToOr(pid);
        assertEq(uint8(h.lockConfigOf(pid).logic), uint8(LiquidityLockMechanism.UnlockLogic.OR));
    }

    function test_switchToOr_alreadyOr_reverts() public {
        _bootstrapGov();
        h.initLock(
            pid, _cfg(LiquidityLockMechanism.UnlockLogic.OR, true, true, launchTime + 60 days, THRESHOLD), launchEndTime
        );
        vm.prank(alice);
        vm.expectRevert(LiquidityLockMechanism.AlreadyOr.selector);
        h.switchToOr(pid);
    }
}
