// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {TokenLaunchHook} from "./TokenLaunchHook.sol";
import {GovernanceModule} from "./mechanisms/GovernanceModule.sol";
import {AntiSnipeMechanism} from "./mechanisms/AntiSnipeMechanism.sol";
import {BuySellTaxMechanism} from "./mechanisms/BuySellTaxMechanism.sol";
import {LiquidityLockMechanism} from "./mechanisms/LiquidityLockMechanism.sol";
import {WhitelistPhaseMechanism} from "./mechanisms/WhitelistPhaseMechanism.sol";
import {MechanismConfig} from "./lib/MechanismConfig.sol";

/// @title CampaignLens
/// @notice Stateless reader (in the spirit of v4's `StateView`) that aggregates a campaign's full
///         state into one `CampaignView` so a frontend can render/edit a campaign in a single static
///         call instead of fanning out across the hook's ~12 per-module getters.
/// @dev Holds no state — only immutable references to the shared `TokenLaunchHook` and the canonical
///      `PositionManager`. The hook stays minimal and at its mined address; this contract can be
///      redeployed freely as the view shape evolves. The `PoolKey` (incl. the dynamic-fee flag and
///      tickSpacing, which the hook does not store) is recovered from the governance LP NFT via
///      `PositionManager.getPoolAndPositionInfo`.
contract CampaignLens {
    using PoolIdLibrary for PoolKey;

    /// @notice Everything a frontend needs to display or edit one campaign.
    /// @dev When `initialized` is false the pool is not a campaign (or not yet bootstrapped); all other
    ///      fields are zero-valued and should be ignored. Module config/derived fields are only
    ///      populated when the matching `enabled` flag is set (otherwise zero-valued).
    struct CampaignView {
        // ─── Identity ───
        PoolId pid;
        PoolKey poolKey; // currency0/1, fee (incl. dynamic-fee flag), tickSpacing, hooks
        bool initialized;
        bool tokenIsCurrency0;
        // ─── Governance / lifecycle ───
        uint256 governanceTokenId;
        address governanceOwner; // current owner of the gov NFT (edit authority)
        address deployer; // original launcher (metadata)
        uint64 launchTime;
        uint64 launchEndTime;
        uint8 phase; // 0 Pre / 1 Active / 2 Frozen
        // ─── Enabled mechanisms ───
        MechanismConfig.EnabledMechanisms enabled;
        // ─── M1 anti-snipe ───
        AntiSnipeMechanism.AntiSnipeConfig antiSnipe;
        // ─── M2 buy/sell tax ───
        BuySellTaxMechanism.BuySellTaxConfig tax;
        uint24 effectiveBuyTax; // decayed + override, as of this block
        uint24 effectiveSellTax;
        // ─── M3 liquidity lock ───
        LiquidityLockMechanism.LiquidityLockConfig lock;
        uint128 cumulativeVolume;
        bool lockUnlocked;
        // ─── M5 whitelist phase ───
        WhitelistPhaseMechanism.WhitelistPhaseConfig whitelist;
    }

    TokenLaunchHook public immutable HOOK;
    IPositionManager public immutable POSM;

    error NotACampaign();

    constructor(TokenLaunchHook _hook, IPositionManager _posm) {
        HOOK = _hook;
        POSM = _posm;
    }

    /// @notice Aggregate one campaign's full state. Returns an un-initialized view (`initialized ==
    ///         false`) if `pid` was never bootstrapped on this hook.
    function getCampaign(PoolId pid) public view returns (CampaignView memory v) {
        v.pid = pid;

        GovernanceModule.GovernanceState memory gov = HOOK.governanceInfoOf(pid);
        if (!gov.initialized) return v; // not a campaign — leave everything zero-valued

        v.initialized = true;
        v.tokenIsCurrency0 = gov.tokenIsCurrency0;
        v.governanceTokenId = gov.tokenId;
        v.deployer = gov.deployer;
        v.launchTime = gov.launchTime;
        v.launchEndTime = gov.launchEndTime;
        v.governanceOwner = HOOK.governanceOwnerOf(pid);
        v.phase = HOOK.launchPhaseOf(pid);

        // PoolKey (incl. dynamic-fee flag + tickSpacing) is not stored by the hook; recover it from
        // the governance LP NFT, which PositionManager keys to the pool.
        (PoolKey memory key,) = POSM.getPoolAndPositionInfo(gov.tokenId);
        v.poolKey = key;

        (bool antiSnipe, bool tax, bool lock, bool whitelist) = HOOK.enabled(pid);
        v.enabled =
            MechanismConfig.EnabledMechanisms({antiSnipe: antiSnipe, tax: tax, lock: lock, whitelist: whitelist});

        if (antiSnipe) v.antiSnipe = HOOK.antiSnipeConfigOf(pid);
        if (tax) {
            v.tax = HOOK.taxConfigOf(pid);
            v.effectiveBuyTax = HOOK.effectiveBuyTaxOf(pid);
            v.effectiveSellTax = HOOK.effectiveSellTaxOf(pid);
        }
        if (lock) {
            v.lock = HOOK.lockConfigOf(pid);
            v.cumulativeVolume = HOOK.cumulativeVolumeOf(pid);
            v.lockUnlocked = HOOK.isUnlocked(pid);
        }
        if (whitelist) v.whitelist = HOOK.whitelistConfigOf(pid);
    }

    /// @notice Batch variant — one static call for a wallet's full set of discovered campaigns.
    function getCampaigns(PoolId[] calldata pids) external view returns (CampaignView[] memory views) {
        views = new CampaignView[](pids.length);
        for (uint256 i = 0; i < pids.length; i++) {
            views[i] = getCampaign(pids[i]);
        }
    }

    /// @notice Discovery entry point: given a PositionManager LP NFT the wallet owns, resolve its pool
    ///         and return the campaign — reverting if that pool is not attached to this hook.
    /// @dev `tokenId` need not be the governance NFT; any LP position in a campaign pool resolves the
    ///      same `pid`. Edit authority is a separate check (`governanceOwner == wallet`).
    function getCampaignByTokenId(uint256 tokenId) external view returns (PoolId pid, CampaignView memory v) {
        (PoolKey memory key,) = POSM.getPoolAndPositionInfo(tokenId);
        if (address(key.hooks) != address(HOOK)) revert NotACampaign();
        pid = key.toId();
        v = getCampaign(pid);
    }
}
