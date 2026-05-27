// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title AntiSnipeMechanism (M1)
/// @notice Caps the size of a single buy during a configurable window after launch, to blunt
///         sniper bots grabbing a large share of supply in the first seconds. Sells are never
///         restricted.
/// @dev Stateless: only the immutable-after-bootstrap config is stored; the check performs no
///      SSTOREs (view-only). BUY/SELL orientation comes from `tokenIsCurrency0`, supplied by the
///      hook from GovernanceModule metadata.
abstract contract AntiSnipeMechanism {
    struct AntiSnipeConfig {
        uint32 antiSnipeDuration; // seconds (0 = disabled); MAX = 1 day
        uint128 maxBuyAmountIn; // max input per buy TX, in pair-currency wei (0 = effective ban)
    }

    uint32 internal constant MAX_ANTISNIPE_DURATION = 1 days;

    mapping(PoolId => AntiSnipeConfig) internal _antiSnipeConfigs;

    error InvalidAntiSnipeDuration();
    error ExactOutNotAllowedDuringAntiSnipe();
    error BuyTooLarge();

    event AntiSnipeInitialized(PoolId indexed pid, AntiSnipeConfig cfg);

    /// @notice Store the anti-snipe config at bootstrap.
    function _initAntiSnipe(PoolId pid, AntiSnipeConfig memory cfg) internal {
        if (cfg.antiSnipeDuration > MAX_ANTISNIPE_DURATION) revert InvalidAntiSnipeDuration();
        _antiSnipeConfigs[pid] = cfg;
        emit AntiSnipeInitialized(pid, cfg);
    }

    /// @notice Enforce the per-buy cap during the anti-snipe window. Called from `_beforeSwap`.
    /// @dev View-only (no SSTOREs). Disabled config or an expired window short-circuits to no-op;
    ///      sells are unrestricted; buys in-window must be exact-input and within `maxBuyAmountIn`.
    function _checkAntiSnipe(PoolId pid, SwapParams calldata params, bool tokenIsCurrency0, uint64 launchTime)
        internal
        view
    {
        AntiSnipeConfig storage cfg = _antiSnipeConfigs[pid];

        if (cfg.antiSnipeDuration == 0) return;
        if (block.timestamp >= launchTime + cfg.antiSnipeDuration) return;

        // BUY iff the swap pays the pair currency to receive the launched token.
        bool isBuy = (params.zeroForOne != tokenIsCurrency0);
        if (!isBuy) return; // sells unrestricted during the window

        // Exact-out makes the input size unpredictable — disallow it for buys in-window.
        if (params.amountSpecified > 0) revert ExactOutNotAllowedDuringAntiSnipe();

        uint256 amountIn = uint256(-params.amountSpecified);
        if (amountIn > cfg.maxBuyAmountIn) revert BuyTooLarge();
    }

    function antiSnipeConfigOf(PoolId pid) external view returns (AntiSnipeConfig memory) {
        return _antiSnipeConfigs[pid];
    }
}
