// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {LaunchMath} from "../../src/lib/LaunchMath.sol";

contract LaunchMathTest is Test {
    function test_decay_atZeroElapsed_returnsInitial() public pure {
        assertEq(LaunchMath.decayedTax(30_000, 3_000, 30 days, 0), 30_000);
    }

    function test_decay_atDuration_returnsBase() public pure {
        assertEq(LaunchMath.decayedTax(30_000, 3_000, 30 days, 30 days), 3_000);
    }

    function test_decay_afterDuration_returnsBase() public pure {
        assertEq(LaunchMath.decayedTax(30_000, 3_000, 30 days, 100 days), 3_000);
    }

    function test_decay_zeroDuration_returnsBase() public pure {
        assertEq(LaunchMath.decayedTax(30_000, 3_000, 0, 0), 3_000);
    }

    function test_decay_midpoint_isLinear() public pure {
        // halfway: 30000 - (27000 * 15d / 30d) = 16500
        assertEq(LaunchMath.decayedTax(30_000, 3_000, 30 days, 15 days), 16_500);
    }

    function test_decay_equalInitialAndBase_isFlat() public pure {
        assertEq(LaunchMath.decayedTax(5_000, 5_000, 30 days, 10 days), 5_000);
    }

    /// @notice For any valid config the result stays within [base, initial] and never increases.
    function testFuzz_decay_withinBounds(uint24 initial, uint24 base, uint32 duration, uint32 elapsed) public pure {
        initial = uint24(bound(initial, 0, 1_000_000));
        base = uint24(bound(base, 0, initial)); // caller guarantees base <= initial

        uint24 r = LaunchMath.decayedTax(initial, base, duration, elapsed);
        assertLe(r, initial);
        assertGe(r, base);
    }

    /// @notice Monotonic non-increasing in elapsed time.
    function testFuzz_decay_monotonic(uint32 e1, uint32 e2) public pure {
        uint24 initial = 80_000;
        uint24 base = 1_000;
        uint32 duration = 45 days;
        if (e1 > e2) (e1, e2) = (e2, e1); // e1 <= e2
        assertGe(LaunchMath.decayedTax(initial, base, duration, e1), LaunchMath.decayedTax(initial, base, duration, e2));
    }
}
