// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "v4-hooks-public/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {GovernanceModule} from "./mechanisms/GovernanceModule.sol";
import {AntiSnipeMechanism} from "./mechanisms/AntiSnipeMechanism.sol";
import {BuySellTaxMechanism} from "./mechanisms/BuySellTaxMechanism.sol";
import {LiquidityLockMechanism} from "./mechanisms/LiquidityLockMechanism.sol";
import {WhitelistPhaseMechanism} from "./mechanisms/WhitelistPhaseMechanism.sol";
import {MechanismConfig} from "./lib/MechanismConfig.sol";

/// @title TokenLaunchHook
/// @notice Single shared v4 hook serving every fair-launch pool on a chain. Per-pool state lives in
///         `mapping(PoolId => ...)` across the inherited mechanism modules. The first mint per pool
///         bootstraps the campaign from `hookData`; subsequent swaps/liquidity actions enforce the
///         enabled modules (anti-snipe, dynamic tax, liquidity lock, whitelist) and governance rules.
/// @dev `tx.origin` is intentionally the authorization subject for the first-mint anti-sandwich
///      check and for per-trade whitelist/anti-snipe/tax accounting: launches and trades route
///      through PositionManager / routers, so `msg.sender` is an intermediary while `tx.origin` is
///      the deployer/trader EOA. This is incompatible with smart-account wallets — a known v1
///      limitation (see tasks/TokenLaunchHook.md review notes).
contract TokenLaunchHook is
    BaseHook,
    AntiSnipeMechanism,
    BuySellTaxMechanism,
    LiquidityLockMechanism,
    WhitelistPhaseMechanism
{
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;

    mapping(PoolId => MechanismConfig.EnabledMechanisms) public enabled;

    error WrongInitPrice();
    error WrongFirstLP();
    error TaxRequiresDynamicFee();

    event CampaignLaunched(PoolId indexed pid, address indexed deployer, MechanismConfig.EnabledMechanisms enabled);

    constructor(IPoolManager _manager, address _positionManager)
        BaseHook(_manager)
        GovernanceModule(_positionManager)
    {}

    // -----------------------------------------------------------------------
    // Hook permissions
    // -----------------------------------------------------------------------
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true, // no-op (V4 enforces first-init-wins)
            afterInitialize: false,
            beforeAddLiquidity: true, // bootstrap + whitelist + sniper checks
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true, // governance burn protection + M3 lock check
            afterRemoveLiquidity: false,
            beforeSwap: true, // anti-snipe + tax (fee override) + whitelist
            afterSwap: true, // M3 volume tracking
            beforeSwapReturnDelta: true, // v2: bonding curve fallback (M6)
            afterSwapReturnDelta: true, // v2: treasury fee routing (M8) + auto-buyback (M7)
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false,
            beforeDonate: false,
            afterDonate: false
        });
    }

    // -----------------------------------------------------------------------
    // Callbacks
    // -----------------------------------------------------------------------

    function _beforeInitialize(address, PoolKey calldata, uint160) internal pure override returns (bytes4) {
        // No-op: config arrives via hookData on the first mint.
        return BaseHook.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4) {
        PoolId pid = key.toId();

        if (!_governance[pid].initialized) {
            _bootstrap(pid, key, params, hookData, sender);
        } else if (enabled[pid].whitelist) {
            // Subsequent adds are whitelist-gated (the bootstrap mint is exempt).
            _checkWhitelist(pid, tx.origin);
        }

        return BaseHook.beforeAddLiquidity.selector;
    }

    function _bootstrap(
        PoolId pid,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData,
        address sender
    ) private {
        MechanismConfig.LaunchConfig memory cfg = MechanismConfig.decode(hookData);

        // Anti-griefing: the pool must have been initialized at the expected price.
        (uint160 sqrtPriceNow,,,) = StateLibrary.getSlot0(poolManager, pid);
        if (sqrtPriceNow != cfg.expectedInitialSqrtPrice) revert WrongInitPrice();

        // Anti-sandwich: only the deployer's own transaction may seed the launch.
        if (tx.origin != cfg.deployer) revert WrongFirstLP();

        // Dynamic-fee pool is required when the tax module overrides the LP fee.
        if (cfg.enabled.tax && !key.fee.isDynamicFee()) revert TaxRequiresDynamicFee();

        // Governance captures the first LP NFT and opens the active phase.
        _initGovernance(
            pid,
            params,
            GovernanceInitConfig({
                deployer: cfg.deployer, launchDuration: cfg.launchDuration, tokenIsCurrency0: cfg.tokenIsCurrency0
            }),
            sender
        );

        enabled[pid] = cfg.enabled;
        if (cfg.enabled.antiSnipe) _initAntiSnipe(pid, cfg.antiSnipe);
        if (cfg.enabled.tax) _initTax(pid, cfg.tax);
        if (cfg.enabled.lock) _initLock(pid, cfg.lock, _governance[pid].launchEndTime);
        if (cfg.enabled.whitelist) {
            _initWhitelist(pid, cfg.whitelist, _governance[pid].launchTime, _governance[pid].launchEndTime);
        }

        emit CampaignLaunched(pid, cfg.deployer, cfg.enabled);
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId pid = key.toId();
        MechanismConfig.EnabledMechanisms memory en = enabled[pid];
        GovernanceState storage gov = _governance[pid];

        if (en.whitelist) _checkWhitelist(pid, tx.origin);
        if (en.antiSnipe) _checkAntiSnipe(pid, params, gov.tokenIsCurrency0, gov.launchTime);

        uint24 fee = 0;
        if (en.tax) {
            uint24 tax = _currentTax(pid, params, gov.tokenIsCurrency0, gov.launchTime);
            emit TaxApplied(pid, tx.origin, params.zeroForOne != gov.tokenIsCurrency0, tax);
            fee = tax | LPFeeLibrary.OVERRIDE_FEE_FLAG;
        }

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId pid = key.toId();
        if (enabled[pid].lock) _trackVolume(pid, delta, _governance[pid].tokenIsCurrency0);
        return (BaseHook.afterSwap.selector, int128(0));
    }

    function _beforeRemoveLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata
    ) internal view override returns (bytes4) {
        PoolId pid = key.toId();
        GovernanceState storage gov = _governance[pid];

        // Only the governance NFT is protected; third-party LPs may exit freely.
        if (gov.initialized && uint256(params.salt) == gov.tokenId) {
            _checkBurnProtection(pid, params); // G3 — minimum lock until launchEndTime
            if (enabled[pid].lock) _checkLiquidityLock(pid); // M3 — extra conditions when enabled
        }

        return BaseHook.beforeRemoveLiquidity.selector;
    }
}
