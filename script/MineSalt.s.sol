// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {HookMiner} from "v4-hooks-public/src/utils/HookMiner.sol";

import {TokenLaunchHook} from "../src/TokenLaunchHook.sol";

/// @title HookDeployLib
/// @notice Shared deploy helpers for the launch stack: the hook permission-flag set (which must match
///         `TokenLaunchHook.getHookPermissions()` exactly, since it is baked into the mined address),
///         the canonical per-chain Uniswap v4 addresses, and CREATE2 salt mining. Used by both
///         `MineSalt` (off-chain helper) and `DeployStack` (the one-shot per-chain deploy).
library HookDeployLib {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev Deterministic CREATE2 deployer proxy `forge script` routes salted `new` through.
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @dev Permit2 is the same canonical singleton on every chain.
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Permission flags encoded into the hook's address; MUST equal `getHookPermissions()`.
    function hookFlags() internal pure returns (uint160) {
        // Must equal getHookPermissions() exactly. v1 uses no return-delta paths, so those flags are
        // omitted (audit M-2); re-add them only in the v2 deployment that implements M6/M7/M8.
        return uint160(
            Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );
    }

    /// @notice Mine a CREATE2 salt yielding a `TokenLaunchHook` address with the correct flag bits.
    /// @return hookAddr predicted address; `salt` the salt to pass to `new TokenLaunchHook{salt: salt}`.
    function mineSalt(address poolManager, address positionManager)
        internal
        view
        returns (address hookAddr, bytes32 salt)
    {
        bytes memory args = abi.encode(IPoolManager(poolManager), positionManager);
        (hookAddr, salt) = HookMiner.find(CREATE2_DEPLOYER, hookFlags(), type(TokenLaunchHook).creationCode, args);
    }

    /// @notice Resolve the network's PoolManager / PositionManager / Permit2.
    /// @dev Env overrides (`POOL_MANAGER`, `POSITION_MANAGER`, `PERMIT2`) win; otherwise the canonical
    ///      v4 deployment for `block.chainid` is used. Reverts on an unknown chain with no overrides.
    function resolveNetwork() internal view returns (address poolManager, address positionManager, address permit2) {
        poolManager = vm.envOr("POOL_MANAGER", address(0));
        positionManager = vm.envOr("POSITION_MANAGER", address(0));
        permit2 = vm.envOr("PERMIT2", PERMIT2);

        if (poolManager == address(0) || positionManager == address(0)) {
            (address cpm, address cposm) = canonical(block.chainid);
            if (poolManager == address(0)) poolManager = cpm;
            if (positionManager == address(0)) positionManager = cposm;
        }

        require(
            poolManager != address(0) && positionManager != address(0),
            "HookDeployLib: unknown chain; set POOL_MANAGER/POSITION_MANAGER env"
        );
    }

    /// @notice Canonical Uniswap v4 (PoolManager, PositionManager) per chain id.
    /// @dev Verified against https://developers.uniswap.org/contracts/v4/deployments (2026-05-31).
    function canonical(uint256 chainId) internal pure returns (address poolManager, address positionManager) {
        if (chainId == 1) {
            // Ethereum mainnet
            return (0x000000000004444c5dc75cB358380D2e3dE08A90, 0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e);
        }
        if (chainId == 8453) {
            // Base
            return (0x498581fF718922c3f8e6A244956aF099B2652b2b, 0x7C5f5A4bBd8fD63184577525326123B519429bDc);
        }
        if (chainId == 42161) {
            // Arbitrum One
            return (0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32, 0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869);
        }
        if (chainId == 130) {
            // Unichain
            return (0x1F98400000000000000000000000000000000004, 0x4529A01c7A0410167c5740C487A8DE60232617bf);
        }
        return (address(0), address(0));
    }
}

/// @title MineSalt
/// @notice Off-chain helper: prints the CREATE2 salt and predicted `TokenLaunchHook` address for a
///         network, so deploys are reproducible. Does not broadcast anything.
/// @dev Run: `forge script script/MineSalt.s.sol --sig run()` (uses canonical addresses for the active
///      chain id) or override with `POOL_MANAGER`/`POSITION_MANAGER` env vars.
contract MineSalt is Script {
    function run() external view {
        (address poolManager, address positionManager,) = HookDeployLib.resolveNetwork();
        (address hookAddr, bytes32 salt) = HookDeployLib.mineSalt(poolManager, positionManager);

        console2.log("chainId         ", block.chainid);
        console2.log("PoolManager     ", poolManager);
        console2.log("PositionManager ", positionManager);
        console2.log("hookFlags       ", uint256(HookDeployLib.hookFlags()));
        console2.log("predicted hook  ", hookAddr);
        console2.log("CREATE2 deployer", HookDeployLib.CREATE2_DEPLOYER);
        console2.logBytes32(salt);
    }
}
