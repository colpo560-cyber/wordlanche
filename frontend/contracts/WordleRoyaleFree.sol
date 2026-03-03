// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title WordleRoyaleFree - Free-to-Play Wordle Game with WRDLE Rewards
/// @notice Players play for free and win WRDLE tokens from a prize pool
/// @dev Single-player mode, resolver signs wins, prizes come from funded pool
contract WordleRoyaleFree is ReentrancyGuard, EIP712, Ownable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS & IMMUTABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice WRDLE token address
    IERC20 public immutable wrdleToken;

    /// @notice Base prize per win (10 WRDLE = 10e18)
    uint256 public basePrize = 10 ether;

    /// @notice Perfect game bonus (1 guess) - 100 WRDLE
    uint256 public perfectGameBonus = 100 ether;

    /// @notice First win ever bonus - 50 WRDLE
    uint256 public firstWinBonus = 50 ether;

    /// @notice Milestone bonuses
    uint256 public milestone10Bonus = 100 ether;   // 10 wins
    uint256 public milestone50Bonus = 500 ether;   // 50 wins
    uint256 public milestone100Bonus = 1000 ether; // 100 wins

    /// @notice Typehash for game resolution signatures
    bytes32 public constant RESOLVE_TYPEHASH = keccak256(
        "Resolve(address resolver,uint256 gameId,address winner,uint8 guessCount)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Game configuration
    struct GameConfig {
        address resolver;  // Backend resolver that signs wins
    }

    /// @notice Player statistics
    struct PlayerStats {
        uint256 wins;
        uint256 gamesPlayed;
        uint256 currentStreak;
        uint256 bestStreak;
        uint256 lastWinTimestamp;
        bool hasFirstWin;
    }

    /// @notice Game instance
    struct Game {
        address player;
        bool resolved;
        uint8 guessCount;
    }

    /// @notice Current game ID per resolver
    mapping(address => uint256) public currentGameId;

    /// @notice Games: resolver => gameId => Game
    mapping(address => mapping(uint256 => Game)) public games;

    /// @notice Player stats
    mapping(address => PlayerStats) public playerStats;

    /// @notice Weekly leaderboard tracking
    uint256 public currentWeekStart;
    mapping(uint256 => address[]) public weeklyPlayers;
    mapping(uint256 => mapping(address => uint256)) public weeklyWins;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event GameStarted(
        address indexed resolver,
        uint256 indexed gameId,
        address indexed player
    );

    event GameResolved(
        address indexed resolver,
        uint256 indexed gameId,
        address indexed winner,
        uint256 prize,
        uint8 guessCount
    );

    event PrizePoolFunded(address indexed funder, uint256 amount);
    event PrizesUpdated(uint256 basePrize, uint256 perfectBonus);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error GameAlreadyResolved();
    error InvalidSignature();
    error WinnerMismatch();
    error InsufficientPrizePool();
    error InvalidGuessCount();

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _wrdleToken,
        address _owner
    ) EIP712("WordleRoyaleFree", "1") Ownable(_owner) {
        wrdleToken = IERC20(_wrdleToken);
        currentWeekStart = _getWeekStart(block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PLAYER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Join a free game
    /// @param resolver The resolver address for this game
    function join(address resolver) external nonReentrant {
        require(resolver != address(0), "Invalid resolver");

        uint256 gameId = currentGameId[resolver];
        Game storage game = games[resolver][gameId];

        // If current game slot is empty, use it; otherwise create new
        if (game.player != address(0)) {
            gameId = ++currentGameId[resolver];
            game = games[resolver][gameId];
        }

        game.player = msg.sender;

        // Update stats
        playerStats[msg.sender].gamesPlayed++;

        emit GameStarted(resolver, gameId, msg.sender);

        // Increment for next game
        currentGameId[resolver]++;
    }

    /// @notice Resolve a game and claim prize
    /// @param resolver The resolver address
    /// @param gameId The game ID
    /// @param winner The winner address
    /// @param guessCount Number of guesses (1-6)
    /// @param signature Resolver's signature
    function resolve(
        address resolver,
        uint256 gameId,
        address winner,
        uint8 guessCount,
        bytes calldata signature
    ) external nonReentrant {
        Game storage game = games[resolver][gameId];

        if (game.resolved) revert GameAlreadyResolved();
        if (game.player != winner) revert WinnerMismatch();
        if (guessCount == 0 || guessCount > 6) revert InvalidGuessCount();

        // Verify signature
        bytes32 structHash = keccak256(abi.encode(
            RESOLVE_TYPEHASH,
            resolver,
            gameId,
            winner,
            guessCount
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, signature);

        if (recoveredSigner != resolver) revert InvalidSignature();

        game.resolved = true;
        game.guessCount = guessCount;

        // Calculate prize
        uint256 prize = _calculatePrize(winner, guessCount);

        // Check prize pool has enough
        if (wrdleToken.balanceOf(address(this)) < prize) {
            revert InsufficientPrizePool();
        }

        // Update player stats
        _updatePlayerStats(winner, guessCount);

        // Update weekly leaderboard
        _updateWeeklyLeaderboard(winner);

        // Transfer prize
        if (prize > 0) {
            wrdleToken.safeTransfer(winner, prize);
        }

        emit GameResolved(resolver, gameId, winner, prize, guessCount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _calculatePrize(address player, uint8 guessCount) internal view returns (uint256) {
        PlayerStats storage stats = playerStats[player];
        uint256 prize = basePrize;

        // Perfect game bonus (1 guess)
        if (guessCount == 1) {
            prize += perfectGameBonus;
        }

        // First win bonus
        if (!stats.hasFirstWin) {
            prize += firstWinBonus;
        }

        // Milestone bonuses
        uint256 newWins = stats.wins + 1;
        if (newWins == 10) {
            prize += milestone10Bonus;
        } else if (newWins == 50) {
            prize += milestone50Bonus;
        } else if (newWins == 100) {
            prize += milestone100Bonus;
        }

        // Streak multiplier (applied to base only)
        uint256 multiplier = _getStreakMultiplier(stats.currentStreak + 1);
        prize = prize + (basePrize * (multiplier - 10000) / 10000);

        return prize;
    }

    function _getStreakMultiplier(uint256 streak) internal pure returns (uint256) {
        if (streak >= 7) return 30000; // 3.0x
        if (streak >= 5) return 20000; // 2.0x
        if (streak >= 3) return 15000; // 1.5x
        if (streak >= 2) return 12000; // 1.2x
        return 10000; // 1.0x
    }

    function _updatePlayerStats(address player, uint8 /* guessCount */) internal {
        PlayerStats storage stats = playerStats[player];

        stats.wins++;
        if (!stats.hasFirstWin) {
            stats.hasFirstWin = true;
        }

        // Check if streak continues (within 48 hours)
        if (block.timestamp - stats.lastWinTimestamp <= 48 hours) {
            stats.currentStreak++;
        } else {
            stats.currentStreak = 1;
        }

        if (stats.currentStreak > stats.bestStreak) {
            stats.bestStreak = stats.currentStreak;
        }

        stats.lastWinTimestamp = block.timestamp;
    }

    function _updateWeeklyLeaderboard(address player) internal {
        uint256 weekStart = _getWeekStart(block.timestamp);

        // Reset if new week
        if (weekStart != currentWeekStart) {
            currentWeekStart = weekStart;
        }

        // Add player to weekly tracking if first win this week
        if (weeklyWins[weekStart][player] == 0) {
            weeklyPlayers[weekStart].push(player);
        }

        weeklyWins[weekStart][player]++;
    }

    function _getWeekStart(uint256 timestamp) internal pure returns (uint256) {
        return timestamp - (timestamp % 1 weeks);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get player statistics
    function getPlayerStats(address player) external view returns (
        uint256 wins,
        uint256 gamesPlayed,
        uint256 currentStreak,
        uint256 bestStreak,
        bool hasFirstWin
    ) {
        PlayerStats storage stats = playerStats[player];
        return (
            stats.wins,
            stats.gamesPlayed,
            stats.currentStreak,
            stats.bestStreak,
            stats.hasFirstWin
        );
    }

    /// @notice Get player's current streak multiplier
    function getStreakMultiplier(address player) external view returns (uint256) {
        return _getStreakMultiplier(playerStats[player].currentStreak);
    }

    /// @notice Get expected prize for a win
    function getExpectedPrize(address player, uint8 guessCount) external view returns (uint256) {
        return _calculatePrize(player, guessCount);
    }

    /// @notice Get weekly leaderboard
    function getWeeklyLeaderboard() external view returns (
        address[] memory players,
        uint256[] memory wins
    ) {
        uint256 weekStart = _getWeekStart(block.timestamp);
        address[] storage weekPlayers = weeklyPlayers[weekStart];

        players = new address[](weekPlayers.length);
        wins = new uint256[](weekPlayers.length);

        for (uint256 i = 0; i < weekPlayers.length; i++) {
            players[i] = weekPlayers[i];
            wins[i] = weeklyWins[weekStart][weekPlayers[i]];
        }
    }

    /// @notice Get prize pool balance
    function getPrizePool() external view returns (uint256) {
        return wrdleToken.balanceOf(address(this));
    }

    /// @notice Check if game is resolved
    function isGameResolved(address resolver, uint256 gameId) external view returns (bool) {
        return games[resolver][gameId].resolved;
    }

    /// @notice Check if player is in a specific game
    function isPlayerInGame(address resolver, uint256 gameId, address player) external view returns (bool) {
        return games[resolver][gameId].player == player;
    }

    /// @notice Get current game ID for resolver
    function getCurrentGameId(address resolver) external view returns (uint256) {
        return currentGameId[resolver];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Fund the prize pool
    function fundPrizePool(uint256 amount) external {
        wrdleToken.safeTransferFrom(msg.sender, address(this), amount);
        emit PrizePoolFunded(msg.sender, amount);
    }

    /// @notice Update prize amounts (owner only)
    function updatePrizes(
        uint256 _basePrize,
        uint256 _perfectGameBonus,
        uint256 _firstWinBonus
    ) external onlyOwner {
        basePrize = _basePrize;
        perfectGameBonus = _perfectGameBonus;
        firstWinBonus = _firstWinBonus;
        emit PrizesUpdated(_basePrize, _perfectGameBonus);
    }

    /// @notice Emergency withdraw (owner only)
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        wrdleToken.safeTransfer(to, amount);
    }

    /// @notice Get domain separator
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
