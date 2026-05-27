// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LiquidityLockMechanism} from "../../src/mechanisms/LiquidityLockMechanism.sol";
import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @notice Test harness exposing LiquidityLockMechanism internals (and GovernanceModule bootstrap,
///         since M3 setters are `onlyGovernance` and the lock layers on top of G3).
contract LiquidityLockHarness is LiquidityLockMechanism {
    constructor(address positionManager) GovernanceModule(positionManager) {}

    function initGovernance(
        PoolId pid,
        ModifyLiquidityParams calldata params,
        GovernanceInitConfig calldata cfg,
        address sender
    ) external {
        _initGovernance(pid, params, cfg, sender);
    }

    function initLock(PoolId pid, LiquidityLockConfig calldata cfg, uint64 launchEndTime) external {
        _initLock(pid, cfg, launchEndTime);
    }

    function trackVolume(PoolId pid, BalanceDelta delta, bool tokenIsCurrency0) external {
        _trackVolume(pid, delta, tokenIsCurrency0);
    }

    /// @notice Mirrors the hook's `_beforeRemoveLiquidity`: for the governance NFT, enforce G3 burn
    ///         protection first, then the M3 lock (M3 treated as enabled in this harness).
    function beforeRemove(PoolId pid, ModifyLiquidityParams calldata params) external view {
        if (uint256(params.salt) == _governance[pid].tokenId) {
            _checkBurnProtection(pid, params); // Governance G3 — always
            _checkLiquidityLock(pid); // M3 — when enabled
        }
    }
}
