// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title WordleToken - Reward token for Wordle Royale
/// @notice ERC20 token distributed as rewards for winning games
contract WordleToken is ERC20, Ownable {
    /// @notice Addresses authorized to mint rewards (game contracts)
    mapping(address => bool) public minters;

    /// @notice Maximum total supply (100 million tokens)
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18;

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);

    error NotMinter();
    error ExceedsMaxSupply();

    constructor() ERC20("Wordlanche", "WRDL") Ownable(msg.sender) {
        // Mint initial supply to deployer for distribution
        _mint(msg.sender, 10_000_000 * 10**18); // 10M tokens
    }

    /// @notice Add a minter (game contract)
    function addMinter(address minter) external onlyOwner {
        minters[minter] = true;
        emit MinterAdded(minter);
    }

    /// @notice Remove a minter
    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    /// @notice Mint tokens (only authorized minters)
    function mint(address to, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        _mint(to, amount);
    }

    /// @notice Owner can mint directly (for initial distribution)
    function ownerMint(address to, uint256 amount) external onlyOwner {
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        _mint(to, amount);
    }
}
