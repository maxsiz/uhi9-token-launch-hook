// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {MechanismConfig} from "../../src/lib/MechanismConfig.sol";
import {AntiSnipeMechanism} from "../../src/mechanisms/AntiSnipeMechanism.sol";
import {BuySellTaxMechanism} from "../../src/mechanisms/BuySellTaxMechanism.sol";
import {LiquidityLockMechanism} from "../../src/mechanisms/LiquidityLockMechanism.sol";
import {WhitelistPhaseMechanism} from "../../src/mechanisms/WhitelistPhaseMechanism.sol";

contract MechanismConfigTest is Test {
    function _fullConfig(MechanismConfig.EnabledMechanisms memory en)
        internal
        pure
        returns (MechanismConfig.LaunchConfig memory)
    {
        return MechanismConfig.LaunchConfig({
            deployer: address(0xBEEF),
            launchDuration: 7 days,
            tokenIsCurrency0: true,
            expectedInitialSqrtPrice: 79228162514264337593543950336, // SQRT_PRICE_1_1
            enabled: en,
            antiSnipe: AntiSnipeMechanism.AntiSnipeConfig({antiSnipeDuration: 1 hours, maxBuyAmountIn: 5 ether}),
            tax: BuySellTaxMechanism.BuySellTaxConfig({
                initialBuyTax: 30_000,
                initialSellTax: 50_000,
                baseTax: 3_000,
                decayDuration: 30 days,
                manualBuyTax: 0,
                manualSellTax: 0
            }),
            lock: LiquidityLockMechanism.LiquidityLockConfig({
                logic: LiquidityLockMechanism.UnlockLogic.OR,
                timeEnabled: true,
                volumeEnabled: true,
                unlockTime: 1000 + 60 days,
                unlockVolumeThreshold: 100 ether
            }),
            whitelist: WhitelistPhaseMechanism.WhitelistPhaseConfig({whitelistEndTime: 1000 + 5 days})
        });
    }

    function test_roundTrip_allEnabled() public pure {
        MechanismConfig.LaunchConfig memory cfg =
            _fullConfig(MechanismConfig.EnabledMechanisms({antiSnipe: true, tax: true, lock: true, whitelist: true}));

        MechanismConfig.LaunchConfig memory dec = MechanismConfig.decode(MechanismConfig.encode(cfg));

        // Top-level governance/launch fields.
        assertEq(dec.deployer, address(0xBEEF));
        assertEq(dec.launchDuration, 7 days);
        assertTrue(dec.tokenIsCurrency0);
        assertEq(dec.expectedInitialSqrtPrice, 79228162514264337593543950336);

        // Flags.
        assertTrue(dec.enabled.antiSnipe);
        assertTrue(dec.enabled.tax);
        assertTrue(dec.enabled.lock);
        assertTrue(dec.enabled.whitelist);

        // Nested module configs.
        assertEq(dec.antiSnipe.antiSnipeDuration, 1 hours);
        assertEq(dec.antiSnipe.maxBuyAmountIn, 5 ether);
        assertEq(dec.tax.initialBuyTax, 30_000);
        assertEq(dec.tax.initialSellTax, 50_000);
        assertEq(dec.tax.baseTax, 3_000);
        assertEq(dec.tax.decayDuration, 30 days);
        assertEq(uint8(dec.lock.logic), uint8(LiquidityLockMechanism.UnlockLogic.OR));
        assertTrue(dec.lock.timeEnabled);
        assertTrue(dec.lock.volumeEnabled);
        assertEq(dec.lock.unlockTime, 1000 + 60 days);
        assertEq(dec.lock.unlockVolumeThreshold, 100 ether);
        assertEq(dec.whitelist.whitelistEndTime, 1000 + 5 days);
    }

    function test_roundTrip_partialFlags() public pure {
        // Only tax enabled; flags must survive exactly even though other configs carry data.
        MechanismConfig.LaunchConfig memory cfg = _fullConfig(
            MechanismConfig.EnabledMechanisms({antiSnipe: false, tax: true, lock: false, whitelist: false})
        );

        MechanismConfig.LaunchConfig memory dec = MechanismConfig.decode(MechanismConfig.encode(cfg));

        assertFalse(dec.enabled.antiSnipe);
        assertTrue(dec.enabled.tax);
        assertFalse(dec.enabled.lock);
        assertFalse(dec.enabled.whitelist);
        // Nested data is preserved regardless of flags.
        assertEq(dec.tax.initialSellTax, 50_000);
        assertEq(dec.lock.unlockVolumeThreshold, 100 ether);
    }

    function testFuzz_roundTrip_topLevelFields(
        address deployer,
        uint64 launchDuration,
        bool tokenIsCurrency0,
        uint160 sqrtPrice
    ) public pure {
        MechanismConfig.LaunchConfig memory cfg = _fullConfig(
            MechanismConfig.EnabledMechanisms({antiSnipe: true, tax: false, lock: true, whitelist: false})
        );
        cfg.deployer = deployer;
        cfg.launchDuration = launchDuration;
        cfg.tokenIsCurrency0 = tokenIsCurrency0;
        cfg.expectedInitialSqrtPrice = sqrtPrice;

        MechanismConfig.LaunchConfig memory dec = MechanismConfig.decode(MechanismConfig.encode(cfg));

        assertEq(dec.deployer, deployer);
        assertEq(dec.launchDuration, launchDuration);
        assertEq(dec.tokenIsCurrency0, tokenIsCurrency0);
        assertEq(dec.expectedInitialSqrtPrice, sqrtPrice);
        assertTrue(dec.enabled.antiSnipe);
        assertFalse(dec.enabled.tax);
    }
}
