// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {StandardToken} from "./StandardToken.sol";

/// @notice Parameters for a freshly deployed token. Shared with `CampaignWrapper`.
struct TokenDeployConfig {
    string name;
    string symbol;
    uint256 totalSupply;
}

/// @title TokenFactory
/// @notice Optional EIP-1167 minimal-proxy factory for cheap ERC-20 deploys, for launchers without
///         an existing token. Independent of the hook — clones are plain `StandardToken` ERC-20s.
contract TokenFactory {
    address public immutable TOKEN_IMPLEMENTATION;

    event TokenDeployed(address indexed token, address indexed recipient, TokenDeployConfig cfg);

    constructor() {
        TOKEN_IMPLEMENTATION = address(new StandardToken());
    }

    /// @notice Clones the implementation, mints `cfg.totalSupply` to `recipient`, and returns the
    ///         new token address.
    function deployToken(TokenDeployConfig calldata cfg, address recipient) external returns (address token) {
        token = Clones.clone(TOKEN_IMPLEMENTATION);
        StandardToken(token).initialize(cfg.name, cfg.symbol, cfg.totalSupply, recipient);
        emit TokenDeployed(token, recipient, cfg);
    }
}
