// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GovernanceModule} from "./GovernanceModule.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @title WhitelistPhaseMechanism (M5)
/// @notice Phased access control: until `whitelistEndTime`, only whitelisted addresses may trade
///         (buy/sell) or add liquidity. After the window ends, restrictions lift entirely. Removing
///         liquidity is ALWAYS allowed (W11) so funds can never be trapped.
/// @dev `_checkWhitelist` takes the actor address explicitly rather than reading `tx.origin`, so the
///      hook chooses the authorization subject (and can avoid the `tx.origin` pitfalls with
///      smart-account wallets / routers). Inherits GovernanceModule for `onlyGovernance` and the
///      per-pool launch timestamps bounding the whitelist window.
abstract contract WhitelistPhaseMechanism is GovernanceModule {
    struct WhitelistPhaseConfig {
        uint64 whitelistEndTime; // must be > launchTime AND <= launchEndTime
    }

    struct WhitelistPhaseState {
        mapping(address => bool) whitelisted;
    }

    mapping(PoolId => WhitelistPhaseConfig) internal _whitelistConfigs;
    mapping(PoolId => WhitelistPhaseState) internal _whitelistStates;

    error NotWhitelisted();
    error InvalidWhitelistEndTime();
    error CanOnlyRelax();

    event WhitelistPhaseInitialized(PoolId indexed pid, uint64 whitelistEndTime);
    event WhitelistEndTimeRelaxed(PoolId indexed pid, uint64 oldTime, uint64 newTime);
    event AddressWhitelisted(PoolId indexed pid, address indexed user);
    event AddressUnwhitelisted(PoolId indexed pid, address indexed user);

    // -----------------------------------------------------------------------
    // Bootstrap
    // -----------------------------------------------------------------------

    function _initWhitelist(PoolId pid, WhitelistPhaseConfig memory cfg, uint64 launchTime, uint64 launchEndTime)
        internal
    {
        // W7 + W8: the whitelist window is bounded by the launch lifecycle.
        if (cfg.whitelistEndTime <= launchTime) revert InvalidWhitelistEndTime();
        if (cfg.whitelistEndTime > launchEndTime) revert InvalidWhitelistEndTime();
        _whitelistConfigs[pid] = cfg;
        emit WhitelistPhaseInitialized(pid, cfg.whitelistEndTime);
    }

    // -----------------------------------------------------------------------
    // Check (called from the hook's _beforeSwap and _beforeAddLiquidity)
    // -----------------------------------------------------------------------

    /// @notice Reverts if `actor` is not whitelisted while the window is open. No-op once expired.
    function _checkWhitelist(PoolId pid, address actor) internal view {
        WhitelistPhaseConfig storage cfg = _whitelistConfigs[pid];
        if (block.timestamp >= cfg.whitelistEndTime) return; // window expired — open phase
        if (!_whitelistStates[pid].whitelisted[actor]) revert NotWhitelisted();
    }

    // -----------------------------------------------------------------------
    // Governance setters
    // -----------------------------------------------------------------------

    function addToWhitelist(PoolId pid, address user) external onlyGovernance(pid) {
        _whitelistStates[pid].whitelisted[user] = true;
        emit AddressWhitelisted(pid, user);
    }

    function addManyToWhitelist(PoolId pid, address[] calldata users) external onlyGovernance(pid) {
        WhitelistPhaseState storage state = _whitelistStates[pid];
        for (uint256 i = 0; i < users.length; i++) {
            state.whitelisted[users[i]] = true;
            emit AddressWhitelisted(pid, users[i]);
        }
    }

    function removeFromWhitelist(PoolId pid, address user) external onlyGovernance(pid) {
        _whitelistStates[pid].whitelisted[user] = false;
        emit AddressUnwhitelisted(pid, user);
    }

    function removeManyFromWhitelist(PoolId pid, address[] calldata users) external onlyGovernance(pid) {
        WhitelistPhaseState storage state = _whitelistStates[pid];
        for (uint256 i = 0; i < users.length; i++) {
            state.whitelisted[users[i]] = false;
            emit AddressUnwhitelisted(pid, users[i]);
        }
    }

    function relaxWhitelistEndTime(PoolId pid, uint64 newEndTime) external onlyGovernance(pid) {
        WhitelistPhaseConfig storage cfg = _whitelistConfigs[pid];
        if (newEndTime >= cfg.whitelistEndTime) revert CanOnlyRelax();
        uint64 old = cfg.whitelistEndTime;
        cfg.whitelistEndTime = newEndTime;
        emit WhitelistEndTimeRelaxed(pid, old, newEndTime);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function whitelistConfigOf(PoolId pid) external view returns (WhitelistPhaseConfig memory) {
        return _whitelistConfigs[pid];
    }

    function isAddressWhitelisted(PoolId pid, address user) external view returns (bool) {
        return _whitelistStates[pid].whitelisted[user];
    }
}
