// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WhitelistPhaseMechanism} from "../../src/mechanisms/WhitelistPhaseMechanism.sol";
import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @notice Test harness exposing WhitelistPhaseMechanism internals and mirroring the hook's
///         whitelist integration points (swap gate, add-liquidity gate with bootstrap skip,
///         and the always-allowed remove path).
contract WhitelistPhaseHarness is WhitelistPhaseMechanism {
    constructor(address positionManager) GovernanceModule(positionManager) {}

    function initGovernance(
        PoolId pid,
        ModifyLiquidityParams calldata params,
        GovernanceInitConfig calldata cfg,
        address sender
    ) external {
        _initGovernance(pid, params, cfg, sender);
    }

    function initWhitelist(PoolId pid, WhitelistPhaseConfig calldata cfg, uint64 launchTime, uint64 launchEndTime)
        external
    {
        _initWhitelist(pid, cfg, launchTime, launchEndTime);
    }

    /// @notice Swap gate — applies to both buys and sells (hook _beforeSwap).
    function checkSwap(PoolId pid, address actor) external view {
        _checkWhitelist(pid, actor);
    }

    /// @notice Add-liquidity gate (hook _beforeAddLiquidity): the bootstrap first mint (governance
    ///         not yet initialized) skips the whitelist; subsequent adds are gated.
    function checkAddLiquidity(PoolId pid, address actor) external view {
        if (_governance[pid].initialized) {
            _checkWhitelist(pid, actor);
        }
    }

    /// @notice Remove path (W11): never gated by the whitelist — always allowed.
    function checkRemove(PoolId, address) external pure {}
}
