// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @notice Test harness exposing GovernanceModule internals and a governance-gated setter,
///         allowing the module to be unit-tested in isolation without a full hook deployment.
contract GovernanceHarness is GovernanceModule {
    uint256 public lastValue;

    constructor(address positionManager) GovernanceModule(positionManager) {}

    function initGovernance(
        PoolId pid,
        ModifyLiquidityParams calldata params,
        GovernanceInitConfig calldata cfg,
        address sender
    ) external {
        _initGovernance(pid, params, cfg, sender);
    }

    function checkBurnProtection(PoolId pid, ModifyLiquidityParams calldata params) external view {
        _checkBurnProtection(pid, params);
    }

    /// @notice Governance-gated setter used to exercise the `onlyGovernance` modifier.
    function bumpValue(PoolId pid, uint256 v) external onlyGovernance(pid) {
        lastValue = v;
    }
}
