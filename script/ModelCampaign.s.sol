// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {CampaignWrapper} from "../src/CampaignWrapper.sol";
import {TokenFactory, TokenDeployConfig} from "../src/TokenFactory.sol";
import {TokenLaunchHook} from "../src/TokenLaunchHook.sol";
import {MechanismConfig} from "../src/lib/MechanismConfig.sol";
import {AntiSnipeMechanism} from "../src/mechanisms/AntiSnipeMechanism.sol";
import {BuySellTaxMechanism} from "../src/mechanisms/BuySellTaxMechanism.sol";
import {LiquidityLockMechanism} from "../src/mechanisms/LiquidityLockMechanism.sol";
import {WhitelistPhaseMechanism} from "../src/mechanisms/WhitelistPhaseMechanism.sol";

/// @title ModelCampaign
/// @notice One-shot broadcast script that models a full campaign lifecycle on Unichain Sepolia (1301)
///         against the already-deployed stack: it creates a fresh factory token, launches a
///         whitelist-only campaign paired with USDC, adds the broadcaster to the whitelist, and buys
///         in the pool. The three lifecycle transactions (launch / addToWhitelist / swap) are what the
///         companion `script/print_tx_links.py` turns into block-explorer links after `--broadcast`.
/// @dev MUST be broadcast from the WHITELIST_ADDR key: that address is the campaign deployer, the
///      governance-NFT owner (so it can modify the campaign) and the swapper (the whitelist check is on
///      `tx.origin`). Run:
///        forge script script/ModelCampaign.s.sol --rpc-url <unichain-sepolia> --broadcast \
///          --private-key <key for 0x97ba7778...>
contract ModelCampaign is Script {
    using PoolIdLibrary for PoolKey;

    // ====================================================================
    // PARAMETERS — edit here
    // ====================================================================

    // --- Deployed stack on Unichain Sepolia (chainId 1301) ---
    //     (from broadcast/DeployStack.s.sol/1301/run-latest.json)
    TokenLaunchHook constant HOOK = TokenLaunchHook(0x79880aBb0c03233e40B87452E7A45Abd96aB0ac0);
    CampaignWrapper constant WRAPPER = CampaignWrapper(0x6F8679BbA6c01c82b5809f2fD6767DDbDE53657b);
    TokenFactory constant FACTORY = TokenFactory(0x41cb3079a635Bc11183C188281B8DB14e4C57f9A);
    IPoolManager constant POOL_MANAGER = IPoolManager(0x00B036B58a818B1BC34d502D3fE730Db729e62AC);
    IAllowanceTransfer constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    // --- Pair currency: USDC on Unichain Sepolia (6 decimals, verified on-chain) ---
    address constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;

    // --- Whitelisted address == the broadcaster (deployer + gov-NFT owner + swapper) ---
    address constant WHITELIST_ADDR = 0x97ba7778dD9CE27bD4953c136F3B3b7b087E14c1;

    // --- New launched token, created on the factory (StandardToken => 18 decimals) ---
    string constant TOKEN_NAME = "Demo Launch";
    string constant TOKEN_SYMBOL = "DEMO";
    uint256 constant TOKEN_SUPPLY = 1_000_000e18;

    // --- Target price: 0.0001 USDC per 1 DEMO token ---
    //     raw terms: 1 token = 1e18 raw; 0.0001 USDC = 0.0001 * 1e6 = 100 raw USDC.
    uint256 constant PRICE_TOKEN_RAW = 1e18; // 1 DEMO (18 decimals)
    uint256 constant PRICE_USDC_RAW = 100; // 0.0001 USDC (6 decimals)

    // --- Seed liquidity: 10 USDC (the matching DEMO side is derived from the price/range) ---
    uint256 constant LIQUIDITY_USDC = 10e6; // 10 USDC

    // --- Demo swap: buy DEMO with 1 USDC (exact input) ---
    uint256 constant SWAP_USDC_IN = 1e6; // 1 USDC

    // --- Campaign lifecycle ---
    uint64 constant LAUNCH_DURATION = 1 days; // contract minimum (16 min is NOT allowed for launchDuration)
    uint64 constant WHITELIST_WINDOW = 16 minutes; // restricted (whitelist) phase, per request

    // --- Pool shape ---
    uint24 constant POOL_FEE = 3000; // static 0.30% fee (whitelist-only campaign, no dynamic tax)
    int24 constant TICK_SPACING = 60;
    int24 constant RANGE_TICKS = 6000; // half-width of the seed LP range, in ticks (aligned to spacing)

    string constant EXPLORER = "https://sepolia.uniscan.xyz";

    // ====================================================================

    function run() external {
        // Fail fast if not broadcast from the whitelisted key: the swap's whitelist check is on tx.origin,
        // and only the gov-NFT owner may modify the campaign.
        require(tx.origin == WHITELIST_ADDR, "ModelCampaign: broadcast from WHITELIST_ADDR (0x97ba7778...)");

        vm.startBroadcast();

        // 1) Create the launched token on the factory (mints the full supply to the broadcaster).
        address token = FACTORY.deployToken(
            TokenDeployConfig({name: TOKEN_NAME, symbol: TOKEN_SYMBOL, totalSupply: TOKEN_SUPPLY}), WHITELIST_ADDR
        );

        // 2) TX «создание кампании» — launch atomically (token + pool + governance mint).
        (PoolKey memory key, uint256 govTokenId) = _launch(token);
        PoolId pid = key.toId();

        // 3) TX «изменение кампании» — governance: add the broadcaster to the whitelist (opens its trading).
        HOOK.addToWhitelist(pid, WHITELIST_ADDR);

        // 4) TX «обмен в пуле» — buy DEMO with USDC (tx.origin = broadcaster ∈ whitelist).
        _swapBuy(key);

        vm.stopBroadcast();

        _logSummary(token, pid, govTokenId);
    }

    // ---------------------------------------------------------------- steps

    /// @dev Compute price/range/liquidity, approve, and launch the whitelist-only campaign.
    function _launch(address token) internal returns (PoolKey memory key, uint256 govTokenId) {
        bool tokenIsCurrency0 = uint160(token) < uint160(USDC); // v4 ordering + launched-token orientation
        uint160 sqrtPriceInit = _sqrtPriceX96(tokenIsCurrency0); // 0.0001 USDC/token for this orientation
        (int24 tickLower, int24 tickUpper) = _range(sqrtPriceInit); // symmetric range around current tick
        (uint128 liquidity, uint128 amount0Max, uint128 amount1Max) =
            _sizeLiquidity(sqrtPriceInit, tickLower, tickUpper, tokenIsCurrency0); // ~10 USDC seed

        // Approvals: let the wrapper pull both currencies from the broadcaster via Permit2.
        _approveWrapper(token);
        _approveWrapper(USDC);

        CampaignWrapper.CampaignParams memory p = CampaignWrapper.CampaignParams({
            existingToken: token, // token already minted to the broadcaster
            tokenConfig: TokenDeployConfig({name: TOKEN_NAME, symbol: TOKEN_SYMBOL, totalSupply: TOKEN_SUPPLY}), // ignored (existingToken set)
            pairToken: USDC,
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            sqrtPriceInit: sqrtPriceInit,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            amount0Max: amount0Max,
            amount1Max: amount1Max,
            lpRecipient: WHITELIST_ADDR, // gov NFT -> broadcaster (so it can modify the campaign)
            launchConfig: _whitelistOnlyConfig()
        });
        (key, govTokenId) = WRAPPER.launchCampaign(p, "");
    }

    /// @dev Buy DEMO with USDC via a self-deployed test router (settles by pulling USDC from the swapper).
    function _swapBuy(PoolKey memory key) internal {
        PoolSwapTest swapRouter = new PoolSwapTest(POOL_MANAGER);
        IERC20(USDC).approve(address(swapRouter), type(uint256).max);
        bool zeroForOne = (Currency.unwrap(key.currency0) == USDC); // paying USDC
        swapRouter.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(SWAP_USDC_IN), // negative = exact input
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            "" // hook ignores hookData on swap
        );
    }

    function _logSummary(address token, PoolId pid, uint256 govTokenId) internal view {
        console2.log("chainId         ", block.chainid);
        console2.log(string.concat("DEMO token      ", EXPLORER, "/address/", vm.toString(token)));
        console2.log(string.concat("USDC pair       ", EXPLORER, "/address/", vm.toString(USDC)));
        console2.log("govTokenId      ", govTokenId);
        console2.log("PoolId:");
        console2.logBytes32(PoolId.unwrap(pid));
        console2.log("Next: python3 script/print_tx_links.py   # prints the 3 transaction links");
    }

    // ---------------------------------------------------------------- helpers

    /// @dev sqrtPriceX96 = sqrt(amount1_raw / amount0_raw) * 2^96, for the launched-token orientation.
    function _sqrtPriceX96(bool tokenIsCurrency0) internal pure returns (uint160) {
        // currency0/currency1 raw "unit" amounts that express the 0.0001 USDC/token price.
        (uint256 amount0, uint256 amount1) = tokenIsCurrency0
            ? (PRICE_TOKEN_RAW, PRICE_USDC_RAW)  // token = c0, USDC = c1
            : (PRICE_USDC_RAW, PRICE_TOKEN_RAW); // USDC = c0, token = c1
        uint256 ratioX192 = FullMath.mulDiv(amount1, uint256(1) << 192, amount0);
        return uint160(Math.sqrt(ratioX192));
    }

    /// @dev Symmetric range around the current tick, snapped to TICK_SPACING and clamped to bounds.
    function _range(uint160 sqrtPriceInit) internal pure returns (int24 tickLower, int24 tickUpper) {
        int24 tick = TickMath.getTickAtSqrtPrice(sqrtPriceInit);
        int24 spaced = (tick / TICK_SPACING) * TICK_SPACING;
        tickLower = spaced - RANGE_TICKS;
        tickUpper = spaced + RANGE_TICKS;
        int24 minTick = (TickMath.minUsableTick(TICK_SPACING));
        int24 maxTick = (TickMath.maxUsableTick(TICK_SPACING));
        if (tickLower < minTick) tickLower = minTick;
        if (tickUpper > maxTick) tickUpper = maxTick;
    }

    /// @dev Size liquidity so the USDC side is ~LIQUIDITY_USDC; derive both amount caps (+1% buffer).
    function _sizeLiquidity(uint160 sqrtPriceInit, int24 tickLower, int24 tickUpper, bool tokenIsCurrency0)
        internal
        pure
        returns (uint128 liquidity, uint128 amount0Max, uint128 amount1Max)
    {
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);

        // USDC side targets LIQUIDITY_USDC; the launched-token side is generous so USDC is the binding cap.
        (uint256 amount0Desired, uint256 amount1Desired) =
            tokenIsCurrency0 ? (TOKEN_SUPPLY, LIQUIDITY_USDC) : (LIQUIDITY_USDC, TOKEN_SUPPLY);

        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceInit, sqrtLower, sqrtUpper, amount0Desired, amount1Desired
        );

        // Exact amounts for that liquidity with the price inside the range (round up = pull side).
        uint256 amount0 = SqrtPriceMath.getAmount0Delta(sqrtPriceInit, sqrtUpper, liquidity, true);
        uint256 amount1 = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtPriceInit, liquidity, true);

        amount0Max = uint128(amount0 + amount0 / 100 + 1); // +1% buffer for mint rounding; leftover is swept
        amount1Max = uint128(amount1 + amount1 / 100 + 1);
    }

    /// @dev Two-step Permit2 grant so the wrapper can pull `token` from the broadcaster during the launch.
    function _approveWrapper(address token) internal {
        IERC20(token).approve(address(PERMIT2), type(uint256).max);
        PERMIT2.approve(token, address(WRAPPER), type(uint160).max, uint48(block.timestamp + 1 days));
    }

    /// @dev LaunchConfig with only the whitelist module enabled; window = now + WHITELIST_WINDOW.
    ///      deployer / expectedInitialSqrtPrice / tokenIsCurrency0 are re-injected by the wrapper.
    function _whitelistOnlyConfig() internal view returns (MechanismConfig.LaunchConfig memory cfg) {
        cfg.launchDuration = LAUNCH_DURATION;
        cfg.enabled = MechanismConfig.EnabledMechanisms({antiSnipe: false, tax: false, lock: false, whitelist: true});
        cfg.whitelist = WhitelistPhaseMechanism.WhitelistPhaseConfig({
            whitelistEndTime: uint64(block.timestamp) + WHITELIST_WINDOW
        });
        // antiSnipe / tax / lock left zero-valued (ignored while their flags are false).
    }
}
