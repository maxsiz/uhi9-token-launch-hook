// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TokenFactory, TokenDeployConfig} from "../src/TokenFactory.sol";
import {StandardToken} from "../src/StandardToken.sol";

contract TokenFactoryTest is Test {
    TokenFactory internal factory;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    // Mirror of TokenFactory's event for vm.expectEmit.
    event TokenDeployed(address indexed token, address indexed recipient, TokenDeployConfig cfg);

    function setUp() public {
        factory = new TokenFactory();
    }

    function _cfg(string memory name, string memory symbol, uint256 supply)
        internal
        pure
        returns (TokenDeployConfig memory)
    {
        return TokenDeployConfig({name: name, symbol: symbol, totalSupply: supply});
    }

    function test_deployToken_clonesAndInitializes() public {
        address token = factory.deployToken(_cfg("My Token", "MTK", 1_000 ether), alice);

        assertTrue(token != address(0), "zero address");
        assertGt(token.code.length, 0, "no code");
        assertEq(StandardToken(token).name(), "My Token");
        assertEq(StandardToken(token).symbol(), "MTK");
        assertEq(StandardToken(token).decimals(), 18);
    }

    function test_deployToken_mintsSupplyToRecipient() public {
        uint256 supply = 5_000 ether;
        address token = factory.deployToken(_cfg("Supply", "SUP", supply), alice);

        assertEq(IERC20(token).totalSupply(), supply);
        assertEq(IERC20(token).balanceOf(alice), supply);
        assertEq(IERC20(token).balanceOf(bob), 0);
    }

    function test_deployToken_emitsTokenDeployed() public {
        TokenDeployConfig memory cfg = _cfg("Event", "EVT", 1 ether);

        // The clone address is not known ahead of time → skip topic1, check recipient + data.
        vm.expectEmit(false, true, false, true, address(factory));
        emit TokenDeployed(address(0), alice, cfg);

        factory.deployToken(cfg, alice);
    }

    function test_clone_reinitialize_reverts() public {
        address token = factory.deployToken(_cfg("Once", "ONE", 1 ether), alice);

        vm.expectRevert(StandardToken.AlreadyInitialized.selector);
        StandardToken(token).initialize("Again", "AGN", 1 ether, bob);
    }

    function test_implementation_cannotBeInitialized() public {
        address impl = factory.TOKEN_IMPLEMENTATION();

        vm.expectRevert(StandardToken.AlreadyInitialized.selector);
        StandardToken(impl).initialize("Impl", "IMP", 1 ether, alice);
    }

    function test_multipleClones_independentState() public {
        address tokenA = factory.deployToken(_cfg("Alpha", "ALP", 100 ether), alice);
        address tokenB = factory.deployToken(_cfg("Beta", "BET", 200 ether), bob);

        assertTrue(tokenA != tokenB, "same clone");

        assertEq(StandardToken(tokenA).name(), "Alpha");
        assertEq(StandardToken(tokenB).name(), "Beta");

        assertEq(IERC20(tokenA).totalSupply(), 100 ether);
        assertEq(IERC20(tokenB).totalSupply(), 200 ether);

        assertEq(IERC20(tokenA).balanceOf(alice), 100 ether);
        assertEq(IERC20(tokenA).balanceOf(bob), 0);
        assertEq(IERC20(tokenB).balanceOf(bob), 200 ether);
        assertEq(IERC20(tokenB).balanceOf(alice), 0);
    }
}
