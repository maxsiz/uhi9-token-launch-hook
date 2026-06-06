// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TokenLaunchHookTestBase} from "./utils/TokenLaunchHookTestBase.sol";

import {PositionConfig} from "@uniswap/v4-periphery/test/shared/PositionConfig.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {CampaignLens} from "../src/CampaignLens.sol";
import {MechanismConfig} from "../src/lib/MechanismConfig.sol";

/// @notice Integration tests for the read-only aggregator: a CampaignLens.getCampaign(pid) snapshot
///         must equal the hook's individual per-module getters, and tokenId→pid discovery must
///         resolve campaign pools and reject foreign ones.
contract CampaignLensTest is TokenLaunchHookTestBase {
    using PoolIdLibrary for PoolKey;

    CampaignLens internal lens;

    function setUp() public override {
        super.setUp();
        lens = new CampaignLens(launchHook, IPositionManager(address(lpm)));
    }

    /// @dev Launch a fully-enabled campaign (all four modules) on the dynamic-fee pool.
    function _launchAllEnabled() internal returns (PoolId pid, uint256 govTokenId, PoolKey memory key) {
        key = _dynamicKey();
        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(true, true, true, true));
        (pid, govTokenId) = _launch(cfg, key);
    }

    // -------------------------------------------------------------------
    // getCampaign — snapshot equals per-module getters
    // -------------------------------------------------------------------

    function test_getCampaign_matchesIndividualGetters() public {
        (PoolId pid, uint256 govTokenId, PoolKey memory key) = _launchAllEnabled();

        CampaignLens.CampaignView memory v = lens.getCampaign(pid);

        // Identity
        assertTrue(v.initialized, "initialized");
        assertEq(PoolId.unwrap(v.pid), PoolId.unwrap(pid), "pid");
        assertEq(Currency.unwrap(v.poolKey.currency0), Currency.unwrap(key.currency0), "currency0");
        assertEq(Currency.unwrap(v.poolKey.currency1), Currency.unwrap(key.currency1), "currency1");
        assertEq(v.poolKey.fee, LPFeeLibrary.DYNAMIC_FEE_FLAG, "dynamic fee flag");
        assertEq(v.poolKey.tickSpacing, key.tickSpacing, "tickSpacing");
        assertEq(address(v.poolKey.hooks), address(launchHook), "hooks");
        assertEq(v.tokenIsCurrency0, TOKEN_IS_C0, "orientation");

        // Governance / lifecycle
        assertEq(v.governanceTokenId, govTokenId, "govTokenId");
        assertEq(v.governanceTokenId, launchHook.governanceTokenIdOf(pid), "govTokenId getter");
        assertEq(v.governanceOwner, deployer, "govOwner");
        assertEq(v.governanceOwner, launchHook.governanceOwnerOf(pid), "govOwner getter");
        assertEq(v.deployer, deployer, "deployer");
        assertEq(v.launchTime, uint64(block.timestamp), "launchTime");
        assertEq(v.launchEndTime, uint64(block.timestamp) + LAUNCH_DURATION, "launchEndTime");
        assertEq(v.phase, launchHook.launchPhaseOf(pid), "phase");

        // Enabled flags
        assertTrue(v.enabled.antiSnipe && v.enabled.tax && v.enabled.lock && v.enabled.whitelist, "enabled");

        // Module configs equal their dedicated getters (compare full encodings)
        assertEq(
            keccak256(abi.encode(v.antiSnipe)),
            keccak256(abi.encode(launchHook.antiSnipeConfigOf(pid))),
            "antiSnipe cfg"
        );
        assertEq(keccak256(abi.encode(v.tax)), keccak256(abi.encode(launchHook.taxConfigOf(pid))), "tax cfg");
        assertEq(v.effectiveBuyTax, launchHook.effectiveBuyTaxOf(pid), "effective buy tax");
        assertEq(v.effectiveSellTax, launchHook.effectiveSellTaxOf(pid), "effective sell tax");
        assertEq(keccak256(abi.encode(v.lock)), keccak256(abi.encode(launchHook.lockConfigOf(pid))), "lock cfg");
        assertEq(v.cumulativeVolume, launchHook.cumulativeVolumeOf(pid), "cumulative volume");
        assertEq(v.lockUnlocked, launchHook.isUnlocked(pid), "lock unlocked");
        assertEq(
            keccak256(abi.encode(v.whitelist)),
            keccak256(abi.encode(launchHook.whitelistConfigOf(pid))),
            "whitelist cfg"
        );
    }

    function test_getCampaign_onlySomeModules_leavesDisabledZeroed() public {
        // Only the lock module enabled (no dynamic fee needed without tax).
        PoolKey memory key = _staticKey();
        MechanismConfig.LaunchConfig memory cfg = _config(_enabled(false, false, true, false));
        (PoolId pid,) = _launch(cfg, key);

        CampaignLens.CampaignView memory v = lens.getCampaign(pid);
        assertTrue(v.initialized);
        assertTrue(v.enabled.lock);
        assertFalse(v.enabled.antiSnipe || v.enabled.tax || v.enabled.whitelist);

        // Disabled modules are left zero-valued.
        assertEq(v.effectiveBuyTax, 0);
        assertEq(v.effectiveSellTax, 0);
        assertEq(v.antiSnipe.maxBuyAmountIn, 0);
        assertEq(v.whitelist.whitelistEndTime, 0);

        // Enabled module is populated.
        assertEq(keccak256(abi.encode(v.lock)), keccak256(abi.encode(launchHook.lockConfigOf(pid))));
    }

    function test_getCampaign_uninitialized_returnsEmpty() public view {
        CampaignLens.CampaignView memory v = lens.getCampaign(PoolId.wrap(keccak256("never-launched")));
        assertFalse(v.initialized);
        assertEq(v.governanceTokenId, 0);
        assertEq(v.governanceOwner, address(0));
        assertEq(v.launchEndTime, 0);
    }

    // -------------------------------------------------------------------
    // getCampaignByTokenId — discovery
    // -------------------------------------------------------------------

    function test_getCampaignByTokenId_resolvesCampaign() public {
        (PoolId pid, uint256 govTokenId,) = _launchAllEnabled();

        (PoolId resolved, CampaignLens.CampaignView memory v) = lens.getCampaignByTokenId(govTokenId);
        assertEq(PoolId.unwrap(resolved), PoolId.unwrap(pid), "resolved pid");
        assertTrue(v.initialized);
        assertEq(v.governanceTokenId, govTokenId);
    }

    function test_getCampaignByTokenId_foreignPool_reverts() public {
        // An LP NFT in a plain pool not attached to our hook must be rejected.
        PoolKey memory plainKey = PoolKey({
            currency0: currency0, currency1: currency1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(0))
        });
        manager.initialize(plainKey, SQRT_PRICE_1_1);

        PositionConfig memory pc = PositionConfig({poolKey: plainKey, tickLower: -600, tickUpper: 600});
        uint256 foreignTokenId = lpm.nextTokenId();
        mint(pc, SEED_LIQUIDITY, address(this), "");

        vm.expectRevert(CampaignLens.NotACampaign.selector);
        lens.getCampaignByTokenId(foreignTokenId);
    }

    // -------------------------------------------------------------------
    // getCampaigns — batch
    // -------------------------------------------------------------------

    function test_getCampaigns_batch_mixesInitializedAndEmpty() public {
        (PoolId pid,,) = _launchAllEnabled();

        PoolId[] memory pids = new PoolId[](2);
        pids[0] = pid;
        pids[1] = PoolId.wrap(keccak256("never-launched"));

        CampaignLens.CampaignView[] memory views = lens.getCampaigns(pids);
        assertEq(views.length, 2);
        assertTrue(views[0].initialized);
        assertEq(PoolId.unwrap(views[0].pid), PoolId.unwrap(pid));
        assertFalse(views[1].initialized);
        assertEq(PoolId.unwrap(views[1].pid), keccak256("never-launched"));
    }
}
