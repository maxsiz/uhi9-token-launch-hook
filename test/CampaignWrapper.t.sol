// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IEIP712} from "permit2/src/interfaces/IEIP712.sol";
import {PermitHash} from "permit2/src/libraries/PermitHash.sol";

import {TokenLaunchHookTestBase} from "./utils/TokenLaunchHookTestBase.sol";
import {CampaignWrapper} from "../src/CampaignWrapper.sol";
import {TokenFactory, TokenDeployConfig} from "../src/TokenFactory.sol";
import {TokenLaunchHook} from "../src/TokenLaunchHook.sol";
import {MechanismConfig} from "../src/lib/MechanismConfig.sol";

contract CampaignWrapperTest is TokenLaunchHookTestBase {
    using PoolIdLibrary for PoolKey;
    using PermitHash for IAllowanceTransfer.PermitBatch;

    CampaignWrapper internal wrapper;
    TokenFactory internal factory;

    uint256 internal deployerPk;
    address internal recipient = makeAddr("recipient");

    uint128 internal constant MAX_PER_SIDE = 50 ether;

    function setUp() public override {
        super.setUp();
        factory = new TokenFactory();
        wrapper = new CampaignWrapper(IPositionManager(address(lpm)), launchHook, factory, permit2);

        // `deployer` is makeAddr("deployer"); recover its key so we can sign Permit2 batches as it.
        (, deployerPk) = makeAddrAndKey("deployer");
        vm.deal(deployer, 100 ether);
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    function _baseParams(
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
        p.launchConfig = _config(en); // deployer/price/orientation are re-injected by the wrapper
    }

    /// @dev Grant the wrapper a direct Permit2 allowance (no signature) for `token`, as the deployer.
    function _grantWrapperAllowance(address token) internal {
        vm.prank(deployer);
        permit2.approve(token, address(wrapper), type(uint160).max, uint48(block.timestamp + 1 days));
    }

    /// @dev Build the encoded permitData granting the wrapper allowance for two tokens via a signed batch.
    function _signedPermitBatch(address tokenA, address tokenB) internal view returns (bytes memory) {
        IAllowanceTransfer.PermitDetails[] memory details = new IAllowanceTransfer.PermitDetails[](2);
        details[0] = IAllowanceTransfer.PermitDetails({
            token: tokenA, amount: type(uint160).max, expiration: uint48(block.timestamp + 1 days), nonce: 0
        });
        details[1] = IAllowanceTransfer.PermitDetails({
            token: tokenB, amount: type(uint160).max, expiration: uint48(block.timestamp + 1 days), nonce: 0
        });
        IAllowanceTransfer.PermitBatch memory batch = IAllowanceTransfer.PermitBatch({
            details: details, spender: address(wrapper), sigDeadline: block.timestamp + 1 days
        });
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", IEIP712(address(permit2)).DOMAIN_SEPARATOR(), batch.hash()));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(deployerPk, digest);
        return abi.encode(batch, abi.encodePacked(r, s, v));
    }

    function _noModules() internal pure returns (MechanismConfig.EnabledMechanisms memory) {
        return MechanismConfig.EnabledMechanisms({antiSnipe: false, tax: false, lock: false, whitelist: false});
    }

    /// @dev Scan revert data for a 4-byte selector (the hook revert is bubbled inside HookCallFailed/WrappedError).
    function _hasSelector(bytes memory data, bytes4 sel) internal pure returns (bool) {
        for (uint256 i = 0; i + 4 <= data.length; ++i) {
            if (data[i] == sel[0] && data[i + 1] == sel[1] && data[i + 2] == sel[2] && data[i + 3] == sel[3]) {
                return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------

    /// New token deployed by the factory, paired against native ETH (deterministic ordering).
    function test_launch_newToken_viaFactory_succeeds() public {
        CampaignWrapper.CampaignParams memory p = _baseParams(address(0), address(0), 3000, _noModules());

        vm.prank(deployer, deployer);
        (PoolKey memory key, uint256 govId) = wrapper.launchCampaign{value: MAX_PER_SIDE}(p, "");

        assertGt(govId, 0, "no gov NFT");
        assertEq(launchHook.governanceTokenIdOf(key.toId()), govId);
        assertEq(IERC721(address(lpm)).ownerOf(govId), deployer);
        // Factory token is currency1 (native sorts to currency0).
        assertEq(Currency.unwrap(key.currency0), address(0));
    }

    /// Existing ERC-20 token + ERC-20 pair, allowance granted directly via Permit2 (no signature).
    function test_launch_existingToken_succeeds() public {
        address token = Currency.unwrap(currency0);
        address pair = Currency.unwrap(currency1);
        _grantWrapperAllowance(token);
        _grantWrapperAllowance(pair);

        CampaignWrapper.CampaignParams memory p = _baseParams(token, pair, 3000, _noModules());

        vm.prank(deployer, deployer);
        (PoolKey memory key, uint256 govId) = wrapper.launchCampaign(p, "");

        assertGt(govId, 0);
        assertEq(launchHook.governanceTokenIdOf(key.toId()), govId);
    }

    /// Existing token paired against native ETH; leftover ETH is swept back to the deployer.
    function test_launch_nativeETHPair_succeeds() public {
        address token = Currency.unwrap(currency1);
        _grantWrapperAllowance(token);

        CampaignWrapper.CampaignParams memory p = _baseParams(token, address(0), 3000, _noModules());

        uint256 balBefore = deployer.balance;
        vm.prank(deployer, deployer);
        (PoolKey memory key, uint256 govId) = wrapper.launchCampaign{value: MAX_PER_SIDE}(p, "");

        assertGt(govId, 0);
        assertEq(Currency.unwrap(key.currency0), address(0));
        // Only the consumed ETH (well under the cap) should have left the deployer.
        assertGt(deployer.balance, balBefore - MAX_PER_SIDE, "leftover ETH not swept back");
    }

    /// Existing token + ERC-20 pair using a signed Permit2 batch passed as permitData.
    function test_launch_erc20Pair_withPermit2_succeeds() public {
        address token = Currency.unwrap(currency0);
        address pair = Currency.unwrap(currency1);
        bytes memory permitData = _signedPermitBatch(token, pair);

        CampaignWrapper.CampaignParams memory p = _baseParams(token, pair, 3000, _noModules());

        vm.prank(deployer, deployer);
        (PoolKey memory key, uint256 govId) = wrapper.launchCampaign(p, permitData);

        assertGt(govId, 0);
        assertEq(launchHook.governanceTokenIdOf(key.toId()), govId);
    }

    /// The governance NFT is captured and delivered to a distinct recipient.
    function test_launch_govNFT_capturedAndDeliveredToRecipient() public {
        address token = Currency.unwrap(currency0);
        address pair = Currency.unwrap(currency1);
        _grantWrapperAllowance(token);
        _grantWrapperAllowance(pair);

        CampaignWrapper.CampaignParams memory p = _baseParams(token, pair, 3000, _noModules());
        p.lpRecipient = recipient;

        vm.prank(deployer, deployer);
        (PoolKey memory key, uint256 govId) = wrapper.launchCampaign(p, "");

        assertEq(launchHook.governanceTokenIdOf(key.toId()), govId);
        assertEq(IERC721(address(lpm)).ownerOf(govId), recipient);
    }

    /// Tax module requires a dynamic-fee pool; a static fee is rejected up front by the wrapper.
    function test_launch_taxEnabled_nonDynamicFee_reverts() public {
        MechanismConfig.EnabledMechanisms memory en = _noModules();
        en.tax = true;

        address token = Currency.unwrap(currency0);
        address pair = Currency.unwrap(currency1);
        CampaignWrapper.CampaignParams memory p = _baseParams(token, pair, 3000, en); // static fee

        vm.prank(deployer, deployer);
        vm.expectRevert(CampaignWrapper.TaxRequiresDynamicFee.selector);
        wrapper.launchCampaign(p, "");
    }

    /// If the pool was already bootstrapped by a prior mint, the post-check catches the mismatch.
    function test_launch_captureFailed_reverts() public {
        // Pre-bootstrap the static pool directly so its governance tokenId is already set.
        _launch(_config(_noModules()), _staticKey());

        address token = Currency.unwrap(currency0);
        address pair = Currency.unwrap(currency1);
        _grantWrapperAllowance(token);
        _grantWrapperAllowance(pair);

        CampaignWrapper.CampaignParams memory p = _baseParams(token, pair, 3000, _noModules());

        vm.prank(deployer, deployer);
        vm.expectRevert(CampaignWrapper.CaptureFailed.selector);
        wrapper.launchCampaign(p, "");
    }

    /// A griefer front-runs pool initialization at the wrong price → bootstrap reverts WrongInitPrice.
    /// Workaround for the deployer: relaunch with a different fee/tickSpacing/salt (new PoolId).
    function test_launch_frontRunPoolInit_griefing_behaviour() public {
        address token = Currency.unwrap(currency0);
        address pair = Currency.unwrap(currency1);
        _grantWrapperAllowance(token);
        _grantWrapperAllowance(pair);

        CampaignWrapper.CampaignParams memory p = _baseParams(token, pair, 3000, _noModules());

        // Griefer initializes the same pool at a different price first.
        PoolKey memory key = _staticKey();
        manager.initialize(key, SQRT_PRICE_1_2);

        vm.prank(deployer, deployer);
        try wrapper.launchCampaign(p, "") {
            revert("expected launch to revert");
        } catch (bytes memory reason) {
            // The bootstrap's price check reverts WrongInitPrice, bubbled via HookCallFailed/WrappedError.
            assertTrue(_hasSelector(reason, TokenLaunchHook.WrongInitPrice.selector), "expected WrongInitPrice");
        }
    }
}
