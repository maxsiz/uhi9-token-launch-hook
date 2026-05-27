// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PosmTestSetup} from "@uniswap/v4-periphery/test/shared/PosmTestSetup.sol";
import {PositionConfig} from "@uniswap/v4-periphery/test/shared/PositionConfig.sol";

import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IPositionDescriptor} from "@uniswap/v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {HookMiner} from "v4-hooks-public/src/utils/HookMiner.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {TokenLaunchHook} from "../../src/TokenLaunchHook.sol";
import {MechanismConfig} from "../../src/lib/MechanismConfig.sol";
import {AntiSnipeMechanism} from "../../src/mechanisms/AntiSnipeMechanism.sol";
import {BuySellTaxMechanism} from "../../src/mechanisms/BuySellTaxMechanism.sol";
import {LiquidityLockMechanism} from "../../src/mechanisms/LiquidityLockMechanism.sol";
import {WhitelistPhaseMechanism} from "../../src/mechanisms/WhitelistPhaseMechanism.sol";

/// @notice Shared integration setup: real PoolManager + PositionManager (Permit2) + the launchHook deployed
///         at a permission-flag address, plus helpers to launch a campaign through PositionManager
///         (so the bootstrap sees sender == PositionManager and salt == bytes32(tokenId)).
abstract contract TokenLaunchHookTestBase is PosmTestSetup {
    using PoolIdLibrary for PoolKey;

    TokenLaunchHook internal launchHook;

    address internal deployer = makeAddr("deployer"); // launch deployer + governance NFT owner
    address internal trader = makeAddr("trader");

    uint64 internal constant LAUNCH_DURATION = 30 days;
    uint256 internal constant SEED_LIQUIDITY = 100e18;

    // Launched token == currency0; pair == currency1.
    bool internal constant TOKEN_IS_C0 = true;

    function setUp() public virtual {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();
        _deployPosm();

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
                | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(manager, address(lpm));
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), flags, type(TokenLaunchHook).creationCode, args);
        launchHook = new TokenLaunchHook{salt: salt}(manager, address(lpm));
        require(address(launchHook) == hookAddr, "launchHook address mismatch");

        // Fund + approve the deployer so it can seed the launch through PositionManager.
        seedBalance(deployer);
        approvePosmFor(deployer);
    }

    /// @dev Deploy PositionManager directly (descriptor = address(0)) to avoid PosmTestSetup's
    ///      `vm.getCode` path, which would require compiling the via-ir-only PositionDescriptor.
    function _deployPosm() internal {
        permit2 = IAllowanceTransfer(deployPermit2());
        _WETH9 = deployWETH();
        lpm = new PositionManager(manager, permit2, 100_000, IPositionDescriptor(address(0)), _WETH9);
        approvePosm(); // approves currency0/1 (permit2 + posm) for address(this)
    }

    // -------------------------------------------------------------------
    // Launch helpers
    // -------------------------------------------------------------------

    function _dynamicKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(launchHook))
        });
    }

    function _staticKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: currency0, currency1: currency1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(launchHook))
        });
    }

    function _enabled(bool antiSnipe, bool tax, bool lock, bool whitelist)
        internal
        pure
        returns (MechanismConfig.EnabledMechanisms memory)
    {
        return MechanismConfig.EnabledMechanisms({antiSnipe: antiSnipe, tax: tax, lock: lock, whitelist: whitelist});
    }

    /// @notice Build a LaunchConfig with sensible per-module defaults; caller toggles `enabled`.
    function _config(MechanismConfig.EnabledMechanisms memory en)
        internal
        view
        returns (MechanismConfig.LaunchConfig memory cfg)
    {
        cfg.deployer = deployer;
        cfg.launchDuration = LAUNCH_DURATION;
        cfg.tokenIsCurrency0 = TOKEN_IS_C0;
        cfg.expectedInitialSqrtPrice = SQRT_PRICE_1_1;
        cfg.enabled = en;
        cfg.antiSnipe = AntiSnipeMechanism.AntiSnipeConfig({antiSnipeDuration: 1 hours, maxBuyAmountIn: 1 ether});
        cfg.tax = BuySellTaxMechanism.BuySellTaxConfig({
            initialBuyTax: 30_000,
            initialSellTax: 50_000,
            baseTax: 3_000,
            decayDuration: 30 days,
            manualBuyTax: 0,
            manualSellTax: 0
        });
        cfg.lock = LiquidityLockMechanism.LiquidityLockConfig({
            logic: LiquidityLockMechanism.UnlockLogic.AND,
            timeEnabled: true,
            volumeEnabled: false,
            unlockTime: uint64(block.timestamp) + LAUNCH_DURATION,
            unlockVolumeThreshold: 0
        });
        cfg.whitelist =
            WhitelistPhaseMechanism.WhitelistPhaseConfig({whitelistEndTime: uint64(block.timestamp) + 5 days});
    }

    /// @notice Initialize the pool and seed the first (governance) position via PositionManager,
    ///         pranking so tx.origin == deployer to satisfy the anti-sandwich check.
    function _launch(MechanismConfig.LaunchConfig memory cfg, PoolKey memory key)
        internal
        returns (PoolId pid, uint256 govTokenId)
    {
        pid = key.toId();
        manager.initialize(key, cfg.expectedInitialSqrtPrice);

        PositionConfig memory pc = PositionConfig({poolKey: key, tickLower: -600, tickUpper: 600});
        govTokenId = lpm.nextTokenId();

        vm.prank(deployer, deployer);
        mint(pc, SEED_LIQUIDITY, deployer, MechanismConfig.encode(cfg));
    }

    /// @notice Fund `t` with both currencies and approve the swap router (so a pranked trader can swap).
    function _fundTrader(address t) internal {
        IERC20(Currency.unwrap(currency0)).transfer(t, 1_000 ether);
        IERC20(Currency.unwrap(currency1)).transfer(t, 1_000 ether);
        vm.startPrank(t);
        IERC20(Currency.unwrap(currency0)).approve(address(swapRouter), type(uint256).max);
        IERC20(Currency.unwrap(currency1)).approve(address(swapRouter), type(uint256).max);
        vm.stopPrank();
    }
}
