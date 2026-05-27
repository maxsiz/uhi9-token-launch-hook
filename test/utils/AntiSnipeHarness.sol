// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AntiSnipeMechanism} from "../../src/mechanisms/AntiSnipeMechanism.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @notice Test harness exposing AntiSnipeMechanism internals for isolated unit testing.
contract AntiSnipeHarness is AntiSnipeMechanism {
    function initAntiSnipe(PoolId pid, AntiSnipeConfig calldata cfg) external {
        _initAntiSnipe(pid, cfg);
    }

    function checkAntiSnipe(PoolId pid, SwapParams calldata params, bool tokenIsCurrency0, uint64 launchTime)
        external
        view
    {
        _checkAntiSnipe(pid, params, tokenIsCurrency0, launchTime);
    }
}
