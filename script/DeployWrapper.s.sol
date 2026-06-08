// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {TokenLaunchHook} from "../src/TokenLaunchHook.sol";
import {CampaignWrapper} from "../src/CampaignWrapper.sol";
import {TokenFactory} from "../src/TokenFactory.sol";

import {HookDeployLib} from "./MineSalt.s.sol";

/// @title DeployWrapper
/// @notice Deploy ONLY a fresh `CampaignWrapper` bound to the EXISTING hook + factory on this chain —
///         e.g. to ship a new wrapper method (the auto-priced `launchCampaign(AutoLaunchParams,…)`
///         overload) without re-mining a new hook. PoolManager/Permit2 come from `HookDeployLib`;
///         `HOOK` and `FACTORY` are passed via env (take them from the live deployment /
///         `web/lib/config/contracts.generated.ts`). The hook, factory and lens are untouched, so
///         existing campaigns keep working — only the wrapper address changes.
/// @dev Run:
///      `HOOK=0x.. FACTORY=0x.. forge script script/DeployWrapper.s.sol --sig run() --rpc-url <chain> --broadcast`
contract DeployWrapper is Script {
    function run() external returns (CampaignWrapper wrapper) {
        (, address positionManager, address permit2) = HookDeployLib.resolveNetwork();
        address hook = vm.envAddress("HOOK");
        address factory = vm.envAddress("FACTORY");

        vm.startBroadcast();
        console2.log("sender          ", msg.sender);
        console2.log("chainId         ", block.chainid);
        wrapper = new CampaignWrapper(
            IPositionManager(positionManager), TokenLaunchHook(hook), TokenFactory(factory), IAllowanceTransfer(permit2)
        );
        vm.stopBroadcast();

        string memory explorer = HookDeployLib.explorerBaseUrl(block.chainid);
        console2.log("PositionManager ", positionManager);
        console2.log("Permit2         ", permit2);
        console2.log("HOOK (reused)   ", hook);
        console2.log("FACTORY (reused)", factory);
        if (bytes(explorer).length == 0) {
            console2.log("CampaignWrapper ", address(wrapper));
        } else {
            console2.log(string.concat("CampaignWrapper ", explorer, "/address/", vm.toString(address(wrapper))));
        }
    }
}
