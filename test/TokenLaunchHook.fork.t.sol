// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TokenLaunchHookTestBase} from "./utils/TokenLaunchHookTestBase.sol";
import {HookDeployLib} from "../script/MineSalt.s.sol";

import {TokenLaunchHook} from "../src/TokenLaunchHook.sol";
import {CampaignWrapper} from "../src/CampaignWrapper.sol";
import {TokenFactory, TokenDeployConfig} from "../src/TokenFactory.sol";
import {MechanismConfig} from "../src/lib/MechanismConfig.sol";
import {BuySellTaxMechanism} from "../src/mechanisms/BuySellTaxMechanism.sol";

import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {PositionConfig} from "@uniswap/v4-periphery/test/shared/PositionConfig.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {HookMiner} from "v4-hooks-public/src/utils/HookMiner.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Mainnet-fork tests against the *real* canonical Uniswap v4 PoolManager & PositionManager
///         (addresses resolved from `HookDeployLib.canonical`, verified on-chain). Reuses the proven
///         launch/swap/remove helpers from `TokenLaunchHookTestBase`, but rebinds `manager`/`lpm`/
///         `permit2` to the forked chain's live deployments instead of fresh test instances.
/// @dev Skips gracefully when no mainnet RPC is configured (the `mainnet` endpoint in foundry.toml
///      resolves to an empty `${ENVELOP_MAINNET}`), so the default `forge test` run stays green.
///      Intended invocation: `forge test --match-path test/TokenLaunchHook.fork.t.sol --fork-url mainnet -vvv`.
contract TokenLaunchHookForkTest is TokenLaunchHookTestBase {
    bool internal forked;

    CampaignWrapper internal wrapper;
    TokenFactory internal factory;
    address internal recipient = makeAddr("recipient");

    uint128 internal constant MAX_PER_SIDE = 50 ether;

    function setUp() public override {
        // Resolve the mainnet RPC; bail out (skip) if it is unavailable so CI without an RPC passes.
        string memory rpc;
        try vm.rpcUrl("mainnet") returns (string memory u) {
            rpc = u;
        } catch {
            return;
        }
        if (bytes(rpc).length == 0) return;
        try vm.createSelectFork(rpc) returns (uint256) {}
        catch {
            return;
        }

        (address poolManager, address positionManager) = HookDeployLib.canonical(block.chainid);
        if (poolManager == address(0)) return; // unsupported fork chain
        forked = true;

        // Bind to the live deployments; deploy only a swap router wired to the real manager.
        manager = IPoolManager(poolManager);
        lpm = PositionManager(payable(positionManager));
        permit2 = IAllowanceTransfer(HookDeployLib.PERMIT2);
        swapRouter = new PoolSwapTest(manager);

        // Test currencies (MockERC20) held by address(this). Use the no-router-approval variant:
        // `deployMintAndApprove2Currencies` would call `nestedActionRouter.executor()` on routers we
        // intentionally don't deploy. Per-actor approvals come from seedBalance/approvePosmFor/_fundTrader.
        (currency0, currency1) = deployAndMint2Currencies();

        // Mine + deploy the hook against the live PoolManager/PositionManager (same path as DeployStack,
        // but with `address(this)` as the CREATE2 deployer, as HookMiner expects under `forge test`).
        uint160 flags = HookDeployLib.hookFlags();
        bytes memory args = abi.encode(manager, address(lpm));
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), flags, type(TokenLaunchHook).creationCode, args);
        launchHook = new TokenLaunchHook{salt: salt}(manager, address(lpm));
        require(address(launchHook) == hookAddr, "launchHook address mismatch");

        // Rest of the stack.
        factory = new TokenFactory();
        wrapper = new CampaignWrapper(IPositionManager(address(lpm)), launchHook, factory, permit2);

        // Fund + approve the deployer so it can seed launches through the real PositionManager.
        seedBalance(deployer);
        approvePosmFor(deployer);
        vm.deal(deployer, 100 ether);

        // LiquidityOperations initializes `_deadline` to 2 (tests normally run at block.timestamp == 1).
        // On a mainnet fork block.timestamp is the live value, so push the deadline into the future.
        _deadline = block.timestamp + 1 hours;
    }

    // -------------------------------------------------------------------
    // 1. Deployed hook carries valid permission flags; live contracts are real.
    // -------------------------------------------------------------------

    function test_fork_deployStack_hookAddressHasValidFlags() public {
        if (!forked) return vm.skip(true);

        assertEq(
            uint160(address(launchHook)) & HookMiner.FLAG_MASK, HookDeployLib.hookFlags(), "hook flag bits mismatch"
        );
        assertGt(address(manager).code.length, 0, "PoolManager has no code on fork");
        assertGt(address(lpm).code.length, 0, "PositionManager has no code on fork");

        // The bound addresses are exactly the canonical registry entries for this chain.
        (address cpm, address cposm) = HookDeployLib.canonical(block.chainid);
        assertEq(address(manager), cpm, "PoolManager != canonical");
        assertEq(address(lpm), cposm, "PositionManager != canonical");
    }

    // -------------------------------------------------------------------
    // 2. Full atomic launch through the wrapper against the live PositionManager.
    // -------------------------------------------------------------------

    function test_fork_launchCampaign_endToEnd() public {
        if (!forked) return vm.skip(true);

        address token = Currency.unwrap(currency0);
        address pair = Currency.unwrap(currency1);
        _grantWrapperAllowance(token);
        _grantWrapperAllowance(pair);

        CampaignWrapper.CampaignParams memory p =
            _wrapperParams(token, pair, 3000, _enabled(false, false, false, false));
        p.lpRecipient = recipient;

        vm.prank(deployer, deployer);
        (PoolKey memory key, uint256 govId) = wrapper.launchCampaign(p, "");

        assertGt(govId, 0, "no governance NFT");
        assertEq(launchHook.governanceTokenIdOf(key.toId()), govId, "gov NFT not captured");
        assertEq(IERC721(address(lpm)).ownerOf(govId), recipient, "gov NFT not delivered");
    }

    // -------------------------------------------------------------------
    // 3. Swap-time modules (dynamic tax + anti-snipe) enforced on the live pool.
    // -------------------------------------------------------------------

    function test_fork_swap_appliesTaxAndAntiSnipe() public {
        if (!forked) return vm.skip(true);

        (PoolId pid,) = _launch(_config(_enabled(true, true, false, false)), _dynamicKey());
        _fundTrader(trader);

        // Small buy (within the 1 ETH anti-snipe cap) → initial 3% buy tax applied via dynamic LP fee.
        vm.expectEmit(true, true, false, true, address(launchHook));
        emit BuySellTaxMechanism.TaxApplied(pid, trader, true, 30_000);
        vm.prank(trader, trader);
        swap(_dynamicKey(), false, -0.1 ether, "");

        // Oversized buy (> maxBuyAmountIn == 1 ETH) → rejected by anti-snipe during the window.
        vm.prank(trader, trader);
        vm.expectRevert();
        swap(_dynamicKey(), false, -2 ether, "");
    }

    // -------------------------------------------------------------------
    // 4. Governance-NFT liquidity lock: blocked during the launch, then released.
    // -------------------------------------------------------------------

    function test_fork_removeLiquidity_blockedThenUnlocked() public {
        if (!forked) return vm.skip(true);

        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(false, false, true, false));
        (, uint256 govId) = _launch(cfg, _dynamicKey());

        PositionConfig memory pc = PositionConfig({poolKey: _dynamicKey(), tickLower: -600, tickUpper: 600});

        // During the active phase the governance NFT cannot be decreased.
        vm.prank(deployer, deployer);
        vm.expectRevert();
        decreaseLiquidity(govId, pc, SEED_LIQUIDITY / 2, "");

        // After launchEnd (== M3 unlockTime) removal is allowed.
        vm.warp(block.timestamp + LAUNCH_DURATION + 1);
        _deadline = block.timestamp + 1; // refresh LiquidityOperations deadline after warping
        vm.prank(deployer, deployer);
        decreaseLiquidity(govId, pc, SEED_LIQUIDITY / 2, "");
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    /// @dev Grant the wrapper a direct Permit2 allowance (no signature) for `token`, as the deployer.
    function _grantWrapperAllowance(address token) internal {
        vm.prank(deployer);
        permit2.approve(token, address(wrapper), type(uint160).max, uint48(block.timestamp + 1 days));
    }

    function _wrapperParams(
        address existingToken,
        address pairToken,
        uint24 fee,
        MechanismConfig.EnabledMechanisms memory en
    ) internal view returns (CampaignWrapper.CampaignParams memory p) {
        p.existingToken = existingToken;
        p.tokenConfig = TokenDeployConfig({name: "Launch", symbol: "LCH", totalSupply: 1_000_000 ether});
        p.pairToken = pairToken;
        p.fee = fee;
        p.tickSpacing = 60;
        p.sqrtPriceInit = SQRT_PRICE_1_1;
        p.tickLower = -600;
        p.tickUpper = 600;
        p.liquidity = uint128(SEED_LIQUIDITY);
        p.amount0Max = MAX_PER_SIDE;
        p.amount1Max = MAX_PER_SIDE;
        p.lpRecipient = deployer;
        p.launchConfig = _config(en);
    }
}
