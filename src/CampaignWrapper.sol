// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPoolInitializer_v4} from "@uniswap/v4-periphery/src/interfaces/IPoolInitializer_v4.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {TokenLaunchHook} from "./TokenLaunchHook.sol";
import {TokenFactory, TokenDeployConfig} from "./TokenFactory.sol";
import {MechanismConfig} from "./lib/MechanismConfig.sol";

/// @title CampaignWrapper
/// @notice Stateless coordinator that performs a fair-launch in one transaction: optionally deploys
///         the ERC-20, builds the `PoolKey`, encodes the launch config into `hookData`, and runs
///         `PositionManager.multicall([initializePool, modifyLiquidities([MINT, SETTLE_PAIR, SWEEP])])`
///         so the hook bootstraps the campaign on the first mint. After the call it verifies the
///         governance NFT was captured and delivered to `lpRecipient`.
/// @dev The wrapper is the PositionManager *locker* during the multicall (Multicall_v4 delegatecalls,
///      so `msgSender()` resolves to the wrapper). It therefore transiently custodies both currencies
///      and grants Permit2→PositionManager allowance so the mint can settle from the wrapper. Leftover
///      pulled funds are refunded to the deployer. The deployer must call this directly as an EOA so
///      that `tx.origin == msg.sender == cfg.deployer` satisfies the hook's anti-sandwich check.
contract CampaignWrapper is ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;
    using LPFeeLibrary for uint24;

    IPositionManager public immutable POSM;
    TokenLaunchHook public immutable HOOK;
    TokenFactory public immutable TOKEN_FACTORY;
    IAllowanceTransfer public immutable PERMIT2;

    struct CampaignParams {
        // Token side — use existing ERC-20 or deploy a fresh one via the factory.
        address existingToken; // 0 → deploy new via TOKEN_FACTORY
        TokenDeployConfig tokenConfig;
        // Pool side.
        address pairToken; // 0 → native ETH
        uint24 fee; // dynamic-fee flag (0x800000) required when the tax module is enabled
        int24 tickSpacing;
        uint160 sqrtPriceInit;
        // First (governance) mint.
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint128 amount0Max;
        uint128 amount1Max;
        address lpRecipient; // receives the governance LP NFT
        // Launch config encoded into hookData (deployer/price/orientation are injected below).
        MechanismConfig.LaunchConfig launchConfig;
    }

    error TaxRequiresDynamicFee();
    error CaptureFailed();
    error NFTNotDelivered();
    error NativeRefundFailed();

    event CampaignLaunched(
        PoolId indexed pid,
        uint256 indexed governanceTokenId,
        address indexed deployer,
        address lpRecipient,
        MechanismConfig.LaunchConfig cfg
    );

    constructor(IPositionManager _posm, TokenLaunchHook _hook, TokenFactory _factory, IAllowanceTransfer _permit2) {
        POSM = _posm;
        HOOK = _hook;
        TOKEN_FACTORY = _factory;
        PERMIT2 = _permit2;
    }

    /// @notice Launch a campaign atomically.
    /// @param params full launch configuration
    /// @param permitData optional `abi.encode(IAllowanceTransfer.PermitBatch, bytes signature)` that
    ///        grants this wrapper allowance to pull the deployer's ERC-20s via Permit2. Empty when no
    ///        pull is needed (fresh token + native ETH pair).
    function launchCampaign(CampaignParams calldata params, bytes calldata permitData)
        external
        payable
        nonReentrant
        returns (PoolKey memory key, uint256 governanceTokenId)
    {
        bool newToken = params.existingToken == address(0);
        address tokenAddr =
            newToken ? TOKEN_FACTORY.deployToken(params.tokenConfig, address(this)) : params.existingToken;

        (Currency currency0, Currency currency1) = _sortCurrencies(tokenAddr, params.pairToken);
        key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: params.fee,
            tickSpacing: params.tickSpacing,
            hooks: IHooks(address(HOOK))
        });

        MechanismConfig.LaunchConfig memory cfg = params.launchConfig;
        if (cfg.enabled.tax && !params.fee.isDynamicFee()) revert TaxRequiresDynamicFee();

        // Inject the trust-critical fields the hook validates at bootstrap.
        cfg.deployer = msg.sender;
        cfg.expectedInitialSqrtPrice = params.sqrtPriceInit;
        cfg.tokenIsCurrency0 = Currency.unwrap(currency0) == tokenAddr;

        // Grant this wrapper allowance to pull the deployer's ERC-20s, then acquire + approve each side.
        if (permitData.length > 0) {
            (IAllowanceTransfer.PermitBatch memory permitBatch, bytes memory signature) =
                abi.decode(permitData, (IAllowanceTransfer.PermitBatch, bytes));
            PERMIT2.permit(msg.sender, permitBatch, signature);
        }
        _prepareCurrency(currency0, params.amount0Max, tokenAddr, newToken);
        _prepareCurrency(currency1, params.amount1Max, tokenAddr, newToken);

        // The LP NFT minted next becomes the governance NFT (salt == bytes32(tokenId)).
        governanceTokenId = POSM.nextTokenId();

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(IPoolInitializer_v4.initializePool, (key, params.sqrtPriceInit));
        calls[1] = abi.encodeCall(
            IPositionManager.modifyLiquidities,
            (_mintActions(key, params, MechanismConfig.encode(cfg)), block.timestamp + 60)
        );
        POSM.multicall{value: msg.value}(calls);

        // Post-checks: the hook captured the NFT and it was delivered to lpRecipient.
        if (governanceTokenId == 0 || HOOK.governanceTokenIdOf(key.toId()) != governanceTokenId) {
            revert CaptureFailed();
        }
        if (IERC721(address(POSM)).ownerOf(governanceTokenId) != params.lpRecipient) revert NFTNotDelivered();

        // Refund any pulled-but-unused balance left in the wrapper to the deployer.
        _refund(currency0, msg.sender);
        _refund(currency1, msg.sender);

        emit CampaignLaunched(key.toId(), governanceTokenId, msg.sender, params.lpRecipient, cfg);
    }

    /// @dev Sort token/pair into (currency0, currency1) per the v4 address-order convention.
    function _sortCurrencies(address tokenAddr, address pairToken)
        private
        pure
        returns (Currency currency0, Currency currency1)
    {
        return uint160(tokenAddr) < uint160(pairToken)
            ? (Currency.wrap(tokenAddr), Currency.wrap(pairToken))
            : (Currency.wrap(pairToken), Currency.wrap(tokenAddr));
    }

    /// @dev Make `amountMax` of `currency` spendable by the PositionManager during the mint. Native
    ///      ETH is covered by the forwarded `msg.value`. A freshly minted token already sits in the
    ///      wrapper; everything else is pulled from the deployer via Permit2.
    function _prepareCurrency(Currency currency, uint128 amountMax, address tokenAddr, bool newToken) private {
        address token = Currency.unwrap(currency);
        if (token == address(0)) return; // native ETH

        bool freshlyMinted = newToken && token == tokenAddr;
        if (!freshlyMinted) {
            PERMIT2.transferFrom(msg.sender, address(this), amountMax, token);
        }

        IERC20(token).forceApprove(address(PERMIT2), amountMax);
        PERMIT2.approve(token, address(POSM), amountMax, uint48(block.timestamp + 60));
    }

    /// @dev Encode MINT_POSITION + SETTLE_PAIR (wrapper is the payer) + a SWEEP per currency to return
    ///      any residual (notably leftover native ETH held by the PositionManager) to the deployer.
    function _mintActions(PoolKey memory key, CampaignParams calldata params, bytes memory hookData)
        private
        view
        returns (bytes memory)
    {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );
        bytes[] memory args = new bytes[](4);
        args[0] = abi.encode(
            key,
            params.tickLower,
            params.tickUpper,
            uint256(params.liquidity),
            params.amount0Max,
            params.amount1Max,
            params.lpRecipient,
            hookData
        );
        args[1] = abi.encode(key.currency0, key.currency1);
        args[2] = abi.encode(key.currency0, msg.sender);
        args[3] = abi.encode(key.currency1, msg.sender);
        return abi.encode(actions, args);
    }

    /// @dev Return the wrapper's residual balance of `currency` to `to`.
    function _refund(Currency currency, address to) private {
        address token = Currency.unwrap(currency);
        if (token == address(0)) {
            uint256 bal = address(this).balance;
            if (bal > 0) {
                (bool ok,) = to.call{value: bal}("");
                if (!ok) revert NativeRefundFailed();
            }
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal > 0) IERC20(token).safeTransfer(to, bal);
        }
    }
}
