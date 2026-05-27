// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GovernanceModule} from "./GovernanceModule.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @title LiquidityLockMechanism (M3)
/// @notice Conditional unlock for the governance NFT (deployer's seed LP). Extends the simple
///         time-based burn protection of GovernanceModule (G3, until `launchEndTime`) with richer
///         criteria: a later unlock time and/or a cumulative-volume threshold, combined with AND/OR.
/// @dev Scope is the governance NFT ONLY — other LPs may add/remove freely. `launchEndTime` is the
///      minimum lock (always enforced by G3); M3 layers stricter requirements on top (AND with G3).
///      Volume is the lifetime sum of absolute pair-currency swap deltas, tracked in `_afterSwap`.
abstract contract LiquidityLockMechanism is GovernanceModule {
    using BalanceDeltaLibrary for BalanceDelta;

    enum UnlockLogic {
        AND,
        OR
    }

    struct LiquidityLockConfig {
        UnlockLogic logic;
        bool timeEnabled;
        bool volumeEnabled;
        uint64 unlockTime; // must be >= launchEndTime at init
        uint128 unlockVolumeThreshold; // pair-currency wei
    }

    struct LiquidityLockState {
        uint128 cumulativeVolume; // accumulated pair-side volume, lifetime
    }

    mapping(PoolId => LiquidityLockConfig) internal _lockConfigs;
    mapping(PoolId => LiquidityLockState) internal _lockStates;

    error NoConditionsEnabled();
    error UnlockTimeBeforeLaunchEnd();
    error CanOnlyRelax();
    error MustKeepOneCondition();
    error LiquidityStillLocked();
    error AlreadyOr();

    event LiquidityLockInitialized(PoolId indexed pid, LiquidityLockConfig cfg);
    event UnlockTimeRelaxed(PoolId indexed pid, uint64 oldTime, uint64 newTime);
    event UnlockVolumeRelaxed(PoolId indexed pid, uint128 oldVol, uint128 newVol);
    event ConditionDisabled(PoolId indexed pid, bool wasTime);
    event LogicSwitchedToOr(PoolId indexed pid);

    // -----------------------------------------------------------------------
    // Bootstrap
    // -----------------------------------------------------------------------

    function _initLock(PoolId pid, LiquidityLockConfig memory cfg, uint64 launchEndTime) internal {
        if (!cfg.timeEnabled && !cfg.volumeEnabled) revert NoConditionsEnabled(); // L4
        if (cfg.timeEnabled && cfg.unlockTime < launchEndTime) revert UnlockTimeBeforeLaunchEnd(); // L11
        if (cfg.volumeEnabled && cfg.unlockVolumeThreshold == 0) revert NoConditionsEnabled();
        _lockConfigs[pid] = cfg;
        emit LiquidityLockInitialized(pid, cfg);
    }

    // -----------------------------------------------------------------------
    // Checks
    // -----------------------------------------------------------------------

    /// @notice Revert if the governance NFT is still locked under M3 criteria.
    function _checkLiquidityLock(PoolId pid) internal view {
        if (!_isUnlocked(pid)) revert LiquidityStillLocked();
    }

    function _isUnlocked(PoolId pid) internal view returns (bool) {
        LiquidityLockConfig storage cfg = _lockConfigs[pid];
        LiquidityLockState storage state = _lockStates[pid];

        bool timeOk = !cfg.timeEnabled || block.timestamp >= cfg.unlockTime;
        bool volumeOk = !cfg.volumeEnabled || state.cumulativeVolume >= cfg.unlockVolumeThreshold;

        if (cfg.logic == UnlockLogic.AND) {
            return timeOk && volumeOk;
        }
        // OR: at least one ENABLED condition must be met.
        return (cfg.timeEnabled && timeOk) || (cfg.volumeEnabled && volumeOk);
    }

    // -----------------------------------------------------------------------
    // Volume tracking (called from the hook's _afterSwap)
    // -----------------------------------------------------------------------

    function _trackVolume(PoolId pid, BalanceDelta delta, bool tokenIsCurrency0) internal {
        int128 pairAmount = tokenIsCurrency0 ? delta.amount1() : delta.amount0();
        uint128 absVol = uint128(uint256(int256(pairAmount < 0 ? -pairAmount : pairAmount)));
        _lockStates[pid].cumulativeVolume += absVol;
    }

    // -----------------------------------------------------------------------
    // Governance setters (one-way relaxation per L3)
    // -----------------------------------------------------------------------

    function relaxUnlockTime(PoolId pid, uint64 newTime) external onlyGovernance(pid) {
        LiquidityLockConfig storage cfg = _lockConfigs[pid];
        if (!cfg.timeEnabled) revert NoConditionsEnabled();
        if (newTime >= cfg.unlockTime) revert CanOnlyRelax();
        uint64 old = cfg.unlockTime;
        cfg.unlockTime = newTime;
        emit UnlockTimeRelaxed(pid, old, newTime);
    }

    function relaxUnlockVolume(PoolId pid, uint128 newVol) external onlyGovernance(pid) {
        LiquidityLockConfig storage cfg = _lockConfigs[pid];
        if (!cfg.volumeEnabled) revert NoConditionsEnabled();
        if (newVol >= cfg.unlockVolumeThreshold) revert CanOnlyRelax();
        if (newVol == 0) revert NoConditionsEnabled(); // use disableVolumeCondition instead
        uint128 old = cfg.unlockVolumeThreshold;
        cfg.unlockVolumeThreshold = newVol;
        emit UnlockVolumeRelaxed(pid, old, newVol);
    }

    function disableTimeCondition(PoolId pid) external onlyGovernance(pid) {
        LiquidityLockConfig storage cfg = _lockConfigs[pid];
        if (!cfg.timeEnabled) revert NoConditionsEnabled();
        if (!cfg.volumeEnabled) revert MustKeepOneCondition(); // L4
        cfg.timeEnabled = false;
        emit ConditionDisabled(pid, true);
    }

    function disableVolumeCondition(PoolId pid) external onlyGovernance(pid) {
        LiquidityLockConfig storage cfg = _lockConfigs[pid];
        if (!cfg.volumeEnabled) revert NoConditionsEnabled();
        if (!cfg.timeEnabled) revert MustKeepOneCondition();
        cfg.volumeEnabled = false;
        emit ConditionDisabled(pid, false);
    }

    function switchToOr(PoolId pid) external onlyGovernance(pid) {
        LiquidityLockConfig storage cfg = _lockConfigs[pid];
        if (cfg.logic == UnlockLogic.OR) revert AlreadyOr();
        cfg.logic = UnlockLogic.OR;
        emit LogicSwitchedToOr(pid);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function lockConfigOf(PoolId pid) external view returns (LiquidityLockConfig memory) {
        return _lockConfigs[pid];
    }

    function cumulativeVolumeOf(PoolId pid) external view returns (uint128) {
        return _lockStates[pid].cumulativeVolume;
    }

    function isUnlocked(PoolId pid) external view returns (bool) {
        return _isUnlocked(pid);
    }
}
