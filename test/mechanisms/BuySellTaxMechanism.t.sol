// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {BuySellTaxMechanism} from "../../src/mechanisms/BuySellTaxMechanism.sol";
import {GovernanceModule} from "../../src/mechanisms/GovernanceModule.sol";
import {BuySellTaxHarness} from "../utils/BuySellTaxHarness.sol";
import {MockPositionManager} from "../utils/MockPositionManager.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

contract BuySellTaxMechanismTest is Test {
    MockPositionManager internal posm;
    BuySellTaxHarness internal h;

    PoolId internal pid = PoolId.wrap(keccak256("pool"));

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice"); // governance NFT owner
    address internal bob = makeAddr("bob");

    // Launched token is currency0 → BUY is zeroForOne == false.
    bool internal constant TOKEN_IS_C0 = true;
    bool internal constant BUY = false;
    bool internal constant SELL = true;

    uint24 internal constant INIT_BUY = 30_000; // 3%
    uint24 internal constant INIT_SELL = 50_000; // 5%
    uint24 internal constant BASE = 3_000; // 0.3%
    uint32 internal constant DECAY = 30 days;
    uint64 internal constant LAUNCH_DURATION = 60 days;

    uint64 internal launchTime;

    function setUp() public {
        posm = new MockPositionManager();
        h = new BuySellTaxHarness(address(posm));
        vm.warp(1000);
        launchTime = uint64(block.timestamp);
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function _cfg(uint24 initBuy, uint24 initSell, uint24 base, uint32 decay, uint24 manualBuy, uint24 manualSell)
        internal
        pure
        returns (BuySellTaxMechanism.BuySellTaxConfig memory)
    {
        return BuySellTaxMechanism.BuySellTaxConfig({
            initialBuyTax: initBuy,
            initialSellTax: initSell,
            baseTax: base,
            decayDuration: decay,
            manualBuyTax: manualBuy,
            manualSellTax: manualSell
        });
    }

    function _defaultCfg() internal pure returns (BuySellTaxMechanism.BuySellTaxConfig memory) {
        return _cfg(INIT_BUY, INIT_SELL, BASE, DECAY, 0, 0);
    }

    function _swap(bool zeroForOne) internal pure returns (SwapParams memory) {
        return SwapParams({zeroForOne: zeroForOne, amountSpecified: -1 ether, sqrtPriceLimitX96: 0});
    }

    function _bootstrapGov(address nftOwner) internal {
        uint256 tokenId = posm.mint(nftOwner);
        ModifyLiquidityParams memory p =
            ModifyLiquidityParams({tickLower: -60, tickUpper: 60, liquidityDelta: 1e18, salt: bytes32(tokenId)});
        GovernanceModule.GovernanceInitConfig memory gcfg = GovernanceModule.GovernanceInitConfig({
            deployer: deployer, launchDuration: LAUNCH_DURATION, tokenIsCurrency0: TOKEN_IS_C0
        });
        h.initGovernance(pid, p, gcfg, address(posm));
    }

    /// @notice Bootstrap governance (alice owns gov NFT) then init the tax module.
    function _setup() internal {
        _bootstrapGov(alice);
        h.initTax(pid, _defaultCfg());
    }

    // -------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------

    function test_init_storesConfig_emitsEvent() public {
        BuySellTaxMechanism.BuySellTaxConfig memory cfg = _defaultCfg();
        vm.expectEmit(true, false, false, true);
        emit BuySellTaxMechanism.BuySellTaxInitialized(pid, cfg);
        h.initTax(pid, cfg);

        BuySellTaxMechanism.BuySellTaxConfig memory stored = h.taxConfigOf(pid);
        assertEq(stored.initialBuyTax, INIT_BUY);
        assertEq(stored.initialSellTax, INIT_SELL);
        assertEq(stored.baseTax, BASE);
        assertEq(stored.decayDuration, DECAY);
    }

    function test_init_initialBelowBase_reverts() public {
        // baseTax greater than an initial tax → invalid.
        vm.expectRevert(BuySellTaxMechanism.InvalidTaxConfig.selector);
        h.initTax(pid, _cfg(INIT_BUY, INIT_SELL, INIT_BUY + 1, DECAY, 0, 0));
    }

    function test_init_initialExceedsMax_reverts() public {
        vm.expectRevert(BuySellTaxMechanism.TaxExceedsMax.selector);
        h.initTax(pid, _cfg(100_001, INIT_SELL, BASE, DECAY, 0, 0));
    }

    function test_init_baseExceedsMax_reverts() public {
        // initial taxes at MAX, base above MAX → TaxExceedsMax (base check fires first).
        vm.expectRevert(BuySellTaxMechanism.TaxExceedsMax.selector);
        h.initTax(pid, _cfg(100_000, 100_000, 100_001, DECAY, 0, 0));
    }

    function test_init_manualPresetAtBootstrap_reverts() public {
        vm.expectRevert(BuySellTaxMechanism.InvalidTaxConfig.selector);
        h.initTax(pid, _cfg(INIT_BUY, INIT_SELL, BASE, DECAY, 1_000, 0));
    }

    // -------------------------------------------------------------------
    // Decay curve
    // -------------------------------------------------------------------

    function test_buy_atLaunchTime_returnsInitialBuyTax() public {
        _setup();
        assertEq(h.currentTax(pid, _swap(BUY), TOKEN_IS_C0, launchTime), INIT_BUY);
    }

    function test_sell_atLaunchTime_returnsInitialSellTax() public {
        _setup();
        assertEq(h.currentTax(pid, _swap(SELL), TOKEN_IS_C0, launchTime), INIT_SELL);
    }

    function test_buy_midDecay_returnsLinearInterpolation() public {
        _setup();
        vm.warp(launchTime + DECAY / 2); // halfway
        // 30000 - (30000-3000)*15d/30d = 30000 - 13500 = 16500
        assertEq(h.currentTax(pid, _swap(BUY), TOKEN_IS_C0, launchTime), 16_500);
    }

    function test_buy_afterDecayDuration_returnsBaseTax() public {
        _setup();
        vm.warp(launchTime + DECAY); // window elapsed
        assertEq(h.currentTax(pid, _swap(BUY), TOKEN_IS_C0, launchTime), BASE);
    }

    function test_zeroDecayDuration_immediatelyReturnsBase() public {
        _bootstrapGov(alice);
        h.initTax(pid, _cfg(INIT_BUY, INIT_SELL, BASE, 0, 0, 0)); // decayDuration = 0
        assertEq(h.currentTax(pid, _swap(BUY), TOKEN_IS_C0, launchTime), BASE);
        assertEq(h.currentTax(pid, _swap(SELL), TOKEN_IS_C0, launchTime), BASE);
    }

    // -------------------------------------------------------------------
    // Overrides
    // -------------------------------------------------------------------

    function test_setBuyTaxOverride_byOwner_succeeds_emitsEvent() public {
        _setup();
        vm.expectEmit(true, false, false, true);
        emit BuySellTaxMechanism.TaxOverrideSet(pid, true, 0, 20_000);
        vm.prank(alice);
        h.setBuyTaxOverride(pid, 20_000);

        // At launch, decayed buy = 30000, override 20000 → effective = 20000.
        assertEq(h.effectiveBuyTaxOf(pid), 20_000);
    }

    function test_setBuyTaxOverride_byNonOwner_reverts() public {
        _setup();
        vm.prank(bob);
        vm.expectRevert(GovernanceModule.NotGovernanceOwner.selector);
        h.setBuyTaxOverride(pid, 20_000);
    }

    function test_setBuyTaxOverride_higherThanCurrent_reverts() public {
        _setup();
        vm.prank(alice);
        h.setBuyTaxOverride(pid, 20_000);
        vm.prank(alice);
        vm.expectRevert(BuySellTaxMechanism.CanOnlyLowerTax.selector);
        h.setBuyTaxOverride(pid, 25_000); // not strictly lower
    }

    function test_setBuyTaxOverride_thenDecayGoesBelow_usesDecay() public {
        _setup();
        vm.prank(alice);
        h.setBuyTaxOverride(pid, 20_000);
        // At +20d: decayed = 30000 - 27000*20/30 = 12000 < 20000 → decay wins.
        vm.warp(launchTime + 20 days);
        assertEq(h.currentTax(pid, _swap(BUY), TOKEN_IS_C0, launchTime), 12_000);
    }

    function test_postLaunchEnd_setOverride_reverts() public {
        _setup();
        vm.warp(launchTime + LAUNCH_DURATION); // governance frozen
        vm.prank(alice);
        vm.expectRevert(GovernanceModule.LaunchEnded.selector);
        h.setBuyTaxOverride(pid, 20_000);
    }
}
