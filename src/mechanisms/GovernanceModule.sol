// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title GovernanceModule
/// @notice Cross-cutting governance infrastructure shared by every launch mechanism.
/// @dev Captures the first LP NFT minted into a pool as that pool's governance NFT,
///      exposes the `onlyGovernance(pid)` modifier used by all mutable setters, tracks the
///      launch lifecycle (Pre / Active / Frozen) and protects the governance NFT from burn /
///      decrease during the active phase. Authorization is purely NFT-ownership based: whoever
///      currently owns the captured tokenId on the PositionManager is the governance owner.
abstract contract GovernanceModule {
    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    struct GovernanceState {
        // slot 0
        uint256 tokenId; // captured at first mint; salt == bytes32(tokenId)
        // slot 1
        uint64 launchTime; // bootstrap timestamp
        uint64 launchEndTime; // governance freeze deadline (immutable post-bootstrap)
        bool initialized; // bootstrap flag — only the first mint flips this
        bool tokenIsCurrency0; // orientation metadata for other modules (BUY vs SELL)
        // slot 2
        address deployer; // metadata only — NOT used for authorization
    }

    /// @notice Bootstrap config decoded from hookData on the first mint per pool.
    struct GovernanceInitConfig {
        address deployer; // metadata; set by CampaignWrapper = msg.sender
        uint64 launchDuration; // seconds; must be in [MIN, MAX]
        bool tokenIsCurrency0; // set by CampaignWrapper from PoolKey sorting
    }

    // -----------------------------------------------------------------------
    // Constants & immutables
    // -----------------------------------------------------------------------

    uint64 internal constant MIN_LAUNCH_DURATION = 1 days;
    uint64 internal constant MAX_LAUNCH_DURATION = 365 days;

    /// @notice Canonical v4 PositionManager — source of truth for LP NFT ownership.
    address public immutable POSITION_MANAGER;

    mapping(PoolId => GovernanceState) internal _governance;

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error NotInitialized();
    error AlreadyInitialized();
    error LaunchEnded();
    error NotGovernanceOwner();
    error MustUsePositionManager();
    error CannotBurnGovernanceNFT();
    error InvalidLaunchDuration();
    /// @dev Shared by mechanisms whose mutable params are one-way relaxable (M3, M5).
    error CanOnlyRelax();

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event CampaignBootstrapped(
        PoolId indexed pid, address indexed deployer, uint256 governanceTokenId, uint64 launchTime, uint64 launchEndTime
    );

    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    constructor(address _positionManager) {
        POSITION_MANAGER = _positionManager;
    }

    // -----------------------------------------------------------------------
    // Authorization
    // -----------------------------------------------------------------------

    /// @notice Restricts a setter to the current owner of the pool's governance NFT,
    ///         only while the launch is still in its active phase.
    modifier onlyGovernance(PoolId pid) {
        GovernanceState storage state = _governance[pid];
        if (!state.initialized) revert NotInitialized();
        if (block.timestamp >= state.launchEndTime) revert LaunchEnded();
        if (IERC721(POSITION_MANAGER).ownerOf(state.tokenId) != msg.sender) {
            revert NotGovernanceOwner();
        }
        _;
    }

    // -----------------------------------------------------------------------
    // Bootstrap (called from the hook's _beforeAddLiquidity on the first mint)
    // -----------------------------------------------------------------------

    /// @notice Captures the first LP NFT as the governance NFT and opens the active phase.
    /// @dev Reverts on any subsequent call for the same pool (only the first mint wins).
    function _initGovernance(
        PoolId pid,
        ModifyLiquidityParams calldata params,
        GovernanceInitConfig memory cfg,
        address sender
    ) internal {
        GovernanceState storage state = _governance[pid];
        if (state.initialized) revert AlreadyInitialized();
        if (sender != POSITION_MANAGER) revert MustUsePositionManager();
        if (cfg.launchDuration < MIN_LAUNCH_DURATION || cfg.launchDuration > MAX_LAUNCH_DURATION) {
            revert InvalidLaunchDuration();
        }

        // salt == bytes32(tokenId) — verified PositionManager convention.
        state.tokenId = uint256(params.salt);
        state.deployer = cfg.deployer; // metadata, no auth
        state.tokenIsCurrency0 = cfg.tokenIsCurrency0; // orientation for other modules
        state.launchTime = uint64(block.timestamp);
        state.launchEndTime = uint64(block.timestamp) + cfg.launchDuration;
        state.initialized = true;

        emit CampaignBootstrapped(pid, cfg.deployer, state.tokenId, state.launchTime, state.launchEndTime);
    }

    // -----------------------------------------------------------------------
    // Burn protection (called from the hook's _beforeRemoveLiquidity)
    // -----------------------------------------------------------------------

    /// @notice Blocks decrease/burn of the governance NFT while the launch is active.
    /// @dev No-op for non-governance positions and after the launch has ended.
    function _checkBurnProtection(PoolId pid, ModifyLiquidityParams calldata params) internal view {
        GovernanceState storage state = _governance[pid];
        if (state.initialized && uint256(params.salt) == state.tokenId && block.timestamp < state.launchEndTime) {
            revert CannotBurnGovernanceNFT();
        }
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function governanceTokenIdOf(PoolId pid) external view returns (uint256) {
        return _governance[pid].tokenId;
    }

    function governanceOwnerOf(PoolId pid) external view returns (address) {
        GovernanceState storage state = _governance[pid];
        return state.initialized ? IERC721(POSITION_MANAGER).ownerOf(state.tokenId) : address(0);
    }

    /// @notice 0 = Pre-launch (uninitialized), 1 = Active, 2 = Frozen (post launchEndTime).
    function launchPhaseOf(PoolId pid) external view returns (uint8) {
        GovernanceState storage state = _governance[pid];
        if (!state.initialized) return 0;
        if (block.timestamp < state.launchEndTime) return 1;
        return 2;
    }
}
