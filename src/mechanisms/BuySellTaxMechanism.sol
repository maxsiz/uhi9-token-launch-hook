// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GovernanceModule} from "./GovernanceModule.sol";
import {LaunchMath} from "../lib/LaunchMath.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title BuySellTaxMechanism (M2)
/// @notice Asymmetric buy/sell tax expressed as a V4 dynamic LP fee. Higher on sells, lower on
///         buys, decaying linearly toward a base rate. v1 collects the tax as LP fee (no
///         ReturnDelta) so it accrues to LPs.
/// @dev Fee units are hundredths of a bip (1e4 = 1%, 1e6 = 100%); the module caps at 10%.
///      Governance may only ratchet the tax DOWN via one-way overrides. Inherits GovernanceModule
///      for the `onlyGovernance` modifier and the per-pool `launchTime` used by the decay curve.
abstract contract BuySellTaxMechanism is GovernanceModule {
    struct BuySellTaxConfig {
        // ─── Immutable post-bootstrap ───
        uint24 initialBuyTax;
        uint24 initialSellTax;
        uint24 baseTax; // final tax after decay (or always, if decayDuration == 0)
        uint32 decayDuration; // seconds (0 = instant decay to baseTax)
        // ─── Mutable by governance, one-way ratchet down ───
        uint24 manualBuyTax; // 0 = no override
        uint24 manualSellTax; // 0 = no override
    }

    uint24 internal constant MAX_TAX = 100_000; // 10% in V4 fee units

    mapping(PoolId => BuySellTaxConfig) internal _taxConfigs;

    error InvalidTaxConfig();
    error TaxExceedsMax();
    error CanOnlyLowerTax();

    event BuySellTaxInitialized(PoolId indexed pid, BuySellTaxConfig cfg);
    event TaxOverrideSet(PoolId indexed pid, bool isBuy, uint24 oldValue, uint24 newValue);
    event TaxApplied(PoolId indexed pid, address indexed trader, bool isBuy, uint24 feeBps);

    // -----------------------------------------------------------------------
    // Bootstrap
    // -----------------------------------------------------------------------

    function _initTax(PoolId pid, BuySellTaxConfig memory cfg) internal {
        if (cfg.initialBuyTax > MAX_TAX) revert TaxExceedsMax();
        if (cfg.initialSellTax > MAX_TAX) revert TaxExceedsMax();
        if (cfg.baseTax > MAX_TAX) revert TaxExceedsMax();
        if (cfg.baseTax > cfg.initialBuyTax || cfg.baseTax > cfg.initialSellTax) {
            revert InvalidTaxConfig();
        }
        if (cfg.manualBuyTax != 0 || cfg.manualSellTax != 0) revert InvalidTaxConfig();
        _taxConfigs[pid] = cfg;
        emit BuySellTaxInitialized(pid, cfg);
    }

    // -----------------------------------------------------------------------
    // Tax computation (stateless, view-only)
    // -----------------------------------------------------------------------

    /// @notice Effective tax for a swap, deriving BUY/SELL from the swap direction.
    function _currentTax(PoolId pid, SwapParams calldata params, bool tokenIsCurrency0, uint64 launchTime)
        internal
        view
        returns (uint24)
    {
        bool isBuy = (params.zeroForOne != tokenIsCurrency0);
        return _taxFor(pid, isBuy, launchTime);
    }

    /// @notice Effective tax for a given direction: min(decayed, override) — override caps, never
    ///         freezes, the decay.
    function _taxFor(PoolId pid, bool isBuy, uint64 launchTime) internal view returns (uint24) {
        BuySellTaxConfig storage cfg = _taxConfigs[pid];
        uint24 initial = isBuy ? cfg.initialBuyTax : cfg.initialSellTax;
        uint24 manual = isBuy ? cfg.manualBuyTax : cfg.manualSellTax;

        uint24 decayed = LaunchMath.decayedTax(initial, cfg.baseTax, cfg.decayDuration, block.timestamp - launchTime);
        if (manual == 0) return decayed;
        return decayed < manual ? decayed : manual;
    }

    // -----------------------------------------------------------------------
    // Governance setters (one-way ratchet down)
    // -----------------------------------------------------------------------

    function setBuyTaxOverride(PoolId pid, uint24 newOverride) external onlyGovernance(pid) {
        _setTaxOverride(pid, true, newOverride);
    }

    function setSellTaxOverride(PoolId pid, uint24 newOverride) external onlyGovernance(pid) {
        _setTaxOverride(pid, false, newOverride);
    }

    function _setTaxOverride(PoolId pid, bool isBuy, uint24 newOverride) internal {
        if (newOverride == 0) revert InvalidTaxConfig(); // 0 reserved for "no override"
        if (newOverride > MAX_TAX) revert TaxExceedsMax();
        BuySellTaxConfig storage cfg = _taxConfigs[pid];
        uint24 old = isBuy ? cfg.manualBuyTax : cfg.manualSellTax;
        // First set has old == 0, so any value is accepted; later sets must be strictly lower.
        if (old != 0 && newOverride >= old) revert CanOnlyLowerTax();
        if (isBuy) cfg.manualBuyTax = newOverride;
        else cfg.manualSellTax = newOverride;
        emit TaxOverrideSet(pid, isBuy, old, newOverride);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function taxConfigOf(PoolId pid) external view returns (BuySellTaxConfig memory) {
        return _taxConfigs[pid];
    }

    function effectiveBuyTaxOf(PoolId pid) external view returns (uint24) {
        return _taxFor(pid, true, _governance[pid].launchTime);
    }

    function effectiveSellTaxOf(PoolId pid) external view returns (uint24) {
        return _taxFor(pid, false, _governance[pid].launchTime);
    }
}
