// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal stand-in for the v4 PositionManager used by GovernanceModule unit tests.
/// @dev Implements only what the module touches: `ownerOf(uint256)` (the IERC721 selector cast in
///      the module) plus helpers to mint and transfer positions. `nextTokenId` mirrors the public
///      counter the real PositionManager exposes so tests can assert the salt == tokenId convention.
contract MockPositionManager {
    mapping(uint256 => address) internal _owners;
    uint256 public nextTokenId = 1;

    error NonexistentToken();

    /// @notice Mint the next sequential position to `to`, returning its tokenId.
    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _owners[tokenId] = to;
    }

    /// @notice Reassign an existing position (simulates an LP NFT transfer).
    function transfer(uint256 tokenId, address to) external {
        _owners[tokenId] = to;
    }

    function ownerOf(uint256 tokenId) external view returns (address owner) {
        owner = _owners[tokenId];
        if (owner == address(0)) revert NonexistentToken();
    }
}
