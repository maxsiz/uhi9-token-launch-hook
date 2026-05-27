// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GovernanceModule} from "../mechanisms/GovernanceModule.sol";
import {AntiSnipeMechanism} from "../mechanisms/AntiSnipeMechanism.sol";
import {BuySellTaxMechanism} from "../mechanisms/BuySellTaxMechanism.sol";
import {LiquidityLockMechanism} from "../mechanisms/LiquidityLockMechanism.sol";
import {WhitelistPhaseMechanism} from "../mechanisms/WhitelistPhaseMechanism.sol";

/// @title MechanismConfig
/// @notice The full per-launch configuration carried in `hookData` on the first mint, plus
///         encode/decode helpers. `CampaignWrapper` builds and encodes a `LaunchConfig`; the hook
///         decodes it during bootstrap and dispatches to the enabled modules.
library MechanismConfig {
    /// @notice Which mechanisms are active for a pool. Set once at bootstrap, immutable thereafter.
    struct EnabledMechanisms {
        bool antiSnipe;
        bool tax;
        bool lock;
        bool whitelist;
    }

    struct LaunchConfig {
        // ─── Governance / launch lifecycle ───
        address deployer; // anti-sandwich subject + metadata (CampaignWrapper sets = msg.sender)
        uint64 launchDuration; // governance phase length
        bool tokenIsCurrency0; // PoolKey orientation of the launched token
        uint160 expectedInitialSqrtPrice; // anti-griefing: pool must be at this price at bootstrap
        // ─── Module toggles ───
        EnabledMechanisms enabled;
        // ─── Per-module configs (ignored unless the matching flag is set) ───
        AntiSnipeMechanism.AntiSnipeConfig antiSnipe;
        BuySellTaxMechanism.BuySellTaxConfig tax;
        LiquidityLockMechanism.LiquidityLockConfig lock;
        WhitelistPhaseMechanism.WhitelistPhaseConfig whitelist;
    }

    function encode(LaunchConfig memory cfg) internal pure returns (bytes memory) {
        return abi.encode(cfg);
    }

    function decode(bytes memory data) internal pure returns (LaunchConfig memory) {
        return abi.decode(data, (LaunchConfig));
    }
}
