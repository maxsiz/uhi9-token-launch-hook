// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title LaunchMath
/// @notice Pure math helpers for launch mechanics. Currently the linear tax-decay curve used by M2.
library LaunchMath {
    /// @notice Linearly decay a tax from `initial` toward `base` over `duration` seconds.
    /// @dev Requires `base <= initial` (enforced by the caller at config time). Returns `base`
    ///      when decay is instant (`duration == 0`) or the window has elapsed.
    /// @param initial Starting tax (V4 fee units; hundredths of a bip).
    /// @param base Final tax once decay completes.
    /// @param duration Decay window in seconds.
    /// @param elapsed Seconds since launch.
    function decayedTax(uint24 initial, uint24 base, uint32 duration, uint256 elapsed) internal pure returns (uint24) {
        if (duration == 0 || elapsed >= duration) return base;
        uint24 reduction = uint24(uint256(initial - base) * elapsed / duration);
        return initial - reduction;
    }
}
