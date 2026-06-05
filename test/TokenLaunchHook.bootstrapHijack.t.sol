// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {TokenLaunchHookTestBase} from "./utils/TokenLaunchHookTestBase.sol";
import {CampaignWrapper} from "../src/CampaignWrapper.sol";
import {TokenFactory, TokenDeployConfig} from "../src/TokenFactory.sol";
import {TokenLaunchHook} from "../src/TokenLaunchHook.sol";
import {MechanismConfig} from "../src/lib/MechanismConfig.sol";

/// @notice H-1 probe — can an attacker who holds ZERO of the launched ERC-20 bootstrap (capture
///         governance on) the canonical pool of an *existing* token? And can a "price but no
///         liquidity" pool be stood up? We target the SAME PoolKey a deployer would use for an
///         existing token (currency0 = the launched token, currency1 = the pair).
contract TokenLaunchHookBootstrapHijackTest is TokenLaunchHookTestBase {
    using PoolIdLibrary for PoolKey;

    CampaignWrapper internal wrapper;
    TokenFactory internal factory;

    // Attacker is a fresh EOA. It is funded with the PAIR token (currency1) only — never the
    // launched token (currency0). currency0 is the "existing token" being launch-hijacked.
    address internal attacker = makeAddr("attacker");

    function setUp() public override {
        super.setUp();
        factory = new TokenFactory();
        wrapper = new CampaignWrapper(IPositionManager(address(lpm)), launchHook, factory, permit2);

        // Give the attacker the PAIR asset only; assert it holds NOTHING of the launched token.
        IERC20(Currency.unwrap(currency1)).transfer(attacker, 1_000 ether);
        assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(attacker), 0, "attacker must hold 0 launched token");
    }

    /// @dev Approve permit2->wrapper for `token` as the attacker (the ERC20->permit2 leg too).
    ///      Works even with a zero balance — approving never moves funds.
    function _attackerApproveWrapper(address token) internal {
        vm.startPrank(attacker);
        IERC20(token).approve(address(permit2), type(uint256).max);
        permit2.approve(token, address(wrapper), type(uint160).max, uint48(block.timestamp + 1 days));
        vm.stopPrank();
    }

    /// @dev Static-fee key on currency0/currency1 — the canonical pool any deployer of `currency0`
    ///      against `currency1` would target. Fully predictable for an existing token.
    function _existingTokenKey() internal view returns (PoolKey memory) {
        return _staticKey();
    }

    function _params(
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint128 amount0Max,
        uint128 amount1Max,
        address recipient
    ) internal view returns (CampaignWrapper.CampaignParams memory p) {
        p.existingToken = Currency.unwrap(currency0); // launch an EXISTING token
        p.tokenConfig = TokenDeployConfig({name: "", symbol: "", totalSupply: 0}); // unused
        p.pairToken = Currency.unwrap(currency1);
        p.fee = 3000; // static fee, no tax module → no dynamic-fee requirement
        p.tickSpacing = 60;
        p.sqrtPriceInit = SQRT_PRICE_1_1;
        p.tickLower = tickLower;
        p.tickUpper = tickUpper;
        p.liquidity = liquidity;
        p.amount0Max = amount0Max;
        p.amount1Max = amount1Max;
        p.lpRecipient = recipient; // receives the governance NFT
        p.launchConfig = _config(_enabled(false, false, false, false));
    }

    /// @dev Scan revert data for a 4-byte selector (the hook revert is bubbled inside HookCallFailed).
    function _hasSelector(bytes memory data, bytes4 sel) internal pure returns (bool) {
        for (uint256 i = 0; i + 4 <= data.length; ++i) {
            if (data[i] == sel[0] && data[i + 1] == sel[1] && data[i + 2] == sel[2] && data[i + 3] == sel[3]) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------------------------------
    // 1. A "price but no liquidity" pool is permissionless — but carries NO campaign/governance.
    // ------------------------------------------------------------------------------------------
    function test_emptyPricedPool_initializeOnly_capturesNoGovernance() public {
        PoolKey memory key = _existingTokenKey();

        // Anyone can initialize the canonical pool at any price. No tokens required.
        vm.prank(attacker, attacker);
        manager.initialize(key, SQRT_PRICE_1_2);

        // The pool exists with a price, but the bootstrap never ran → governance is unset.
        assertEq(launchHook.governanceTokenIdOf(key.toId()), 0, "init alone must NOT bootstrap a campaign");
    }

    // ------------------------------------------------------------------------------------------
    // 2. Via the wrapper with liquidity == 0 ("price but no liquidity"): NOT possible. The
    //    PositionManager rejects a zero-liquidity MINT with CannotUpdateEmptyPosition() before the
    //    bootstrap or the wrapper's capture post-check is ever reached. The whole atomic launch
    //    (including the pool init) is rolled back. So a campaign always requires a real position.
    // ------------------------------------------------------------------------------------------
    function test_wrapper_zeroLiquidity_reverts() public {
        _attackerApproveWrapper(Currency.unwrap(currency0));
        _attackerApproveWrapper(Currency.unwrap(currency1));

        CampaignWrapper.CampaignParams memory p = _params(-600, 600, 0, 0, 0, attacker);

        vm.prank(attacker, attacker);
        vm.expectRevert(bytes4(keccak256("CannotUpdateEmptyPosition()")));
        wrapper.launchCampaign(p, "");

        // Sanity: nothing was bootstrapped (the whole tx reverted).
        assertEq(launchHook.governanceTokenIdOf(_existingTokenKey().toId()), 0);
    }

    // ------------------------------------------------------------------------------------------
    // 3. H-1 FIX (audit option A): the free pair-only single-sided capture is now rejected. An
    //    attacker holding ZERO launched token seeds liquidity entirely below the price (currency1
    //    only) → the bootstrap reverts ZeroLaunchedTokenLiquidity and nothing is captured.
    // ------------------------------------------------------------------------------------------
    function test_wrapper_noLaunchedToken_singleSidedPair_reverts() public {
        _attackerApproveWrapper(Currency.unwrap(currency0)); // amount pulled = 0, allowance still required
        _attackerApproveWrapper(Currency.unwrap(currency1));

        // Range fully below current tick (0): only currency1 (pair) is required, currency0 (launched) = 0.
        CampaignWrapper.CampaignParams memory p = _params(-1200, -600, 1e18, 0, 50 ether, attacker);

        vm.prank(attacker, attacker);
        try wrapper.launchCampaign(p, "") {
            revert("expected ZeroLaunchedTokenLiquidity revert");
        } catch (bytes memory reason) {
            assertTrue(
                _hasSelector(reason, TokenLaunchHook.ZeroLaunchedTokenLiquidity.selector),
                "expected ZeroLaunchedTokenLiquidity"
            );
        }

        // Nothing was bootstrapped; the attacker still holds zero launched token.
        assertEq(launchHook.governanceTokenIdOf(_existingTokenKey().toId()), 0, "pool must not be captured");
        assertEq(IERC20(Currency.unwrap(currency0)).balanceOf(attacker), 0);
    }

    // ------------------------------------------------------------------------------------------
    // 4. The fix does NOT break legitimate token-only single-sided launches: a deployer seeding a
    //    range entirely ABOVE the price (currency0/launched only, currency1 amount = 0) still
    //    bootstraps and captures governance.
    // ------------------------------------------------------------------------------------------
    function test_wrapper_tokenOnly_singleSidedLaunched_succeeds() public {
        // `deployer` already holds currency0 (base seedBalance). Grant the wrapper a Permit2 allowance.
        vm.startPrank(deployer);
        permit2.approve(
            Currency.unwrap(currency0), address(wrapper), type(uint160).max, uint48(block.timestamp + 1 days)
        );
        permit2.approve(
            Currency.unwrap(currency1), address(wrapper), type(uint160).max, uint48(block.timestamp + 1 days)
        );
        vm.stopPrank();

        // Range fully above current tick (0): only currency0 (launched) is required, currency1 = 0.
        CampaignWrapper.CampaignParams memory p = _params(600, 1200, 1e18, 50 ether, 0, deployer);

        vm.prank(deployer, deployer);
        (PoolKey memory key, uint256 govId) = wrapper.launchCampaign(p, "");

        PoolId pid = key.toId();
        assertGt(govId, 0, "no governance NFT minted");
        assertEq(launchHook.governanceTokenIdOf(pid), govId, "token-only launch failed to bootstrap");
        assertEq(launchHook.governanceOwnerOf(pid), deployer, "deployer does not control governance");
    }
}
