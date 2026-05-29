// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title StandardToken
/// @notice Initializable, clone-safe ERC-20 minted in full to a recipient at launch. Designed to be
///         deployed once as an implementation and cloned cheaply via EIP-1167 by `TokenFactory`.
/// @dev Clones never run the constructor, so OpenZeppelin `ERC20`'s `_name`/`_symbol` (set in its
///      constructor) stay empty on a clone. We keep our own name/symbol storage set in `initialize`
///      and override the getters. The constructor locks the implementation itself so it can never be
///      initialized or used as a live token. `decimals()` stays at the ERC-20 default of 18.
contract StandardToken is ERC20 {
    string private _tokenName;
    string private _tokenSymbol;
    bool private _initialized;

    error AlreadyInitialized();

    constructor() ERC20("", "") {
        _initialized = true; // lock the implementation; only clones may be initialized
    }

    /// @notice One-time setup for a freshly cloned token: sets metadata and mints the entire supply.
    /// @param name_ token name
    /// @param symbol_ token symbol
    /// @param totalSupply_ amount minted in full to `recipient`
    /// @param recipient address receiving the entire initial supply
    function initialize(string calldata name_, string calldata symbol_, uint256 totalSupply_, address recipient)
        external
    {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;

        _tokenName = name_;
        _tokenSymbol = symbol_;

        _mint(recipient, totalSupply_);
    }

    function name() public view override returns (string memory) {
        return _tokenName;
    }

    function symbol() public view override returns (string memory) {
        return _tokenSymbol;
    }
}
