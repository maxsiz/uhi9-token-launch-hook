// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BuySellTaxMechanism} from "../../src/mechanisms/BuySellTaxMechanism.sol";
import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @notice Test harness exposing BuySellTaxMechanism internals (and GovernanceModule bootstrap,
///         since tax setters are gated by `onlyGovernance`).
contract BuySellTaxHarness is BuySellTaxMechanism {
    constructor(address positionManager) GovernanceModule(positionManager) {}

    function initGovernance(
        PoolId pid,
        ModifyLiquidityParams calldata params,
        GovernanceInitConfig calldata cfg,
        address sender
    ) external {
        _initGovernance(pid, params, cfg, sender);
    }

    function initTax(PoolId pid, BuySellTaxConfig calldata cfg) external {
        _initTax(pid, cfg);
    }

    function currentTax(PoolId pid, SwapParams calldata params, bool tokenIsCurrency0, uint64 launchTime)
        external
        view
        returns (uint24)
    {
        return _currentTax(pid, params, tokenIsCurrency0, launchTime);
    }
}
