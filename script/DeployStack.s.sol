// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {HookMiner} from "v4-hooks-public/src/utils/HookMiner.sol";

import {TokenLaunchHook} from "../src/TokenLaunchHook.sol";
import {CampaignWrapper} from "../src/CampaignWrapper.sol";
import {CampaignLens} from "../src/CampaignLens.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

import {HookDeployLib} from "./MineSalt.s.sol";

/// @title DeployStack
/// @notice One-shot, per-chain deploy of the launch stack:
///         1. mine CREATE2 salt → deploy `TokenLaunchHook` at a permission-flag address,
///         2. deploy `TokenFactory` (which deploys the `StandardToken` implementation),
///         3. deploy the stateless `CampaignWrapper`,
///         4. deploy the stateless `CampaignLens` (read-only aggregator for frontends).
/// @dev Idempotent w.r.t. its network inputs: PoolManager/PositionManager/Permit2 come from env
///      overrides or the canonical registry in `HookDeployLib`. Both core contracts are
///      non-upgradeable — a new version is a fresh deploy at a new address.
///      Run: `forge script script/DeployStack.s.sol --sig run() --rpc-url <chain> --broadcast`.
contract DeployStack is Script {
    function run()
        external
        returns (TokenLaunchHook hook, CampaignWrapper wrapper, TokenFactory factory, CampaignLens lens)
    {
        (address poolManager, address positionManager, address permit2) = HookDeployLib.resolveNetwork();

        // Mine the salt off the broadcast so the predicted address is known up front.
        (address predicted, bytes32 salt) = HookDeployLib.mineSalt(poolManager, positionManager);

        vm.startBroadcast();
        console2.log("sender          ", msg.sender);
        console2.log("sender balance: ", address(msg.sender).balance);
        console2.log("block:          ", block.number);
        hook = new TokenLaunchHook{salt: salt}(IPoolManager(poolManager), positionManager);
        factory = new TokenFactory();
        wrapper = new CampaignWrapper(IPositionManager(positionManager), hook, factory, IAllowanceTransfer(permit2));
        lens = new CampaignLens(hook, IPositionManager(positionManager));
        vm.stopBroadcast();

        // The deployed hook must land at the mined address with exactly the declared permission flags,
        // otherwise PoolManager will reject pools that reference it (Hooks.isValidHookAddress).
        require(address(hook) == predicted, "DeployStack: hook address mismatch");
        require(
            (uint160(address(hook)) & HookMiner.FLAG_MASK) == HookDeployLib.hookFlags(),
            "DeployStack: hook flag bits invalid"
        );

        string memory explorer = HookDeployLib.explorerBaseUrl(block.chainid);

        console2.log("chainId        ", block.chainid);
        console2.log("PoolManager    ", poolManager);
        console2.log("PositionManager", positionManager);
        console2.log("Permit2        ", permit2);

        // Deployed artifacts as block-explorer links (falls back to the raw address on unknown chains).
        _logArtifact("TokenLaunchHook", address(hook), explorer);
        _logArtifact("CampaignWrapper", address(wrapper), explorer);
        _logArtifact("CampaignLens   ", address(lens), explorer);
        _logArtifact("TokenFactory   ", address(factory), explorer);
        _logArtifact("StandardToken  ", factory.TOKEN_IMPLEMENTATION(), explorer);
    }

    /// @dev Log `label` with a block-explorer link to `addr`, or the raw address if `explorer` is "".
    function _logArtifact(string memory label, address addr, string memory explorer) private pure {
        if (bytes(explorer).length == 0) {
            console2.log(label, addr);
        } else {
            console2.log(string.concat(label, " ", explorer, "/address/", vm.toString(addr)));
        }
    }
}
