// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IWordleToken
 * @notice Interface for the WRDLE token
 */
interface IWordleToken {
    function mint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title WordleRoyaleV3
 * @notice Wordle game where players pay MON fees and win WRDLE token prizes
 * @dev V3: MON fees go to treasury, all prizes in WRDLE tokens
 *
 * New Model:
 * - Players pay configurable MON fee to play
 * - MON fees collected by treasury (owner)
 * - Winners receive WRDLE tokens based on fee multiplier
 * - Streak bonuses and achievements still apply
 */
contract WordleRoyaleV3 is EIP712, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    struct GameConfig {
        address resolver;      // Backend wallet that signs results
        uint256 entryFee;      // MON fee to play (e.g., 1 ether = 1 MON)
        uint256 capacity;      // Players per game (1 for single player)
    }

    struct PlayerStats {
        uint256 totalWins;
        uint256 totalGamesPlayed;
        uint256 currentStreak;
        uint256 bestStreak;
        uint256 lastWinDay;
        bool hasFirstWin;
        bool has10Wins;
        bool has50Wins;
        bool has100Wins;
    }

    struct WeeklyLeaderboard {
        uint256 weekNumber;
        address[] players;
        mapping(address => uint256) wins;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    // Prize multiplier: 1 MON fee = 100 WRDLE tokens
    uint256 public constant PRIZE_MULTIPLIER = 100;

    // Bonus rewards (in WRDLE tokens, 18 decimals)
    uint256 public constant PERFECT_GAME_BONUS = 100 * 1e18;    // Win in 1 guess
    uint256 public constant FIRST_WIN_BONUS = 50 * 1e18;        // First ever win
    uint256 public constant MILESTONE_10_BONUS = 100 * 1e18;    // 10 wins
    uint256 public constant MILESTONE_50_BONUS = 500 * 1e18;    // 50 wins
    uint256 public constant MILESTONE_100_BONUS = 1000 * 1e18;  // 100 wins

    // Streak multipliers (in basis points, 10000 = 1x)
    uint256 public constant STREAK_DAY_2 = 15000;   // 1.5x
    uint256 public constant STREAK_DAY_3 = 20000;   // 2x
    uint256 public constant STREAK_DAY_7 = 30000;   // 3x

    bytes32 private constant RESOLVE_TYPEHASH = keccak256(
        "Resolve(address resolver,uint256 entryFee,uint256 capacity,uint256 gameId,address winner,uint256 tokenPrize,uint8 guessCount)"
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════

    IWordleToken public immutable wordleToken;
    address public treasury;

    // configHash => gameId => players
    mapping(bytes32 => mapping(uint256 => address[])) public gamePlayers;

    // configHash => gameId => resolved
    mapping(bytes32 => mapping(uint256 => bool)) public gameResolved;

    // configHash => current gameId
    mapping(bytes32 => uint256) public currentGameId;

    // configHash => total MON collected
    mapping(bytes32 => uint256) public totalFeesCollected;

    // Player statistics
    mapping(address => PlayerStats) public playerStats;

    // Weekly leaderboard
    WeeklyLeaderboard private _weeklyLeaderboard;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event PlayerJoined(
        bytes32 indexed configHash,
        uint256 indexed gameId,
        address indexed player,
        uint256 feePaid
    );

    event GameResolved(
        bytes32 indexed configHash,
        uint256 indexed gameId,
        address indexed winner,
        uint256 tokenPrize,
        uint8 guessCount
    );

    event FeesWithdrawn(address indexed to, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _wordleToken,
        address _treasury
    ) EIP712("WordleRoyaleV3", "1") Ownable(msg.sender) {
        require(_wordleToken != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");

        wordleToken = IWordleToken(_wordleToken);
        treasury = _treasury;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Join a game by paying the entry fee in MON
     * @param config Game configuration
     */
    function join(GameConfig calldata config) external payable nonReentrant {
        require(config.resolver != address(0), "Invalid resolver");
        require(config.entryFee > 0, "Invalid entry fee");
        require(config.capacity > 0, "Invalid capacity");
        require(msg.value == config.entryFee, "Wrong fee amount");

        bytes32 configHash = getConfigHash(config);
        uint256 gameId = currentGameId[configHash];
        address[] storage players = gamePlayers[configHash][gameId];

        require(players.length < config.capacity, "Game full");

        // Check not already in game
        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != msg.sender, "Already joined");
        }

        players.push(msg.sender);
        totalFeesCollected[configHash] += msg.value;

        emit PlayerJoined(configHash, gameId, msg.sender, msg.value);

        // Advance to next game if full
        if (players.length == config.capacity) {
            currentGameId[configHash]++;
        }
    }

    /**
     * @notice Resolve a game with backend signature
     * @param config Game configuration
     * @param gameId Game ID to resolve
     * @param winner Winner address
     * @param tokenPrize Base WRDLE prize amount (before bonuses)
     * @param guessCount Number of guesses used
     * @param signature Backend signature
     */
    function resolve(
        GameConfig calldata config,
        uint256 gameId,
        address winner,
        uint256 tokenPrize,
        uint8 guessCount,
        bytes calldata signature
    ) external nonReentrant {
        bytes32 configHash = getConfigHash(config);

        require(!gameResolved[configHash][gameId], "Already resolved");
        require(guessCount >= 1 && guessCount <= 6, "Invalid guess count");

        // Verify winner was in the game
        address[] storage players = gamePlayers[configHash][gameId];
        bool found = false;
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == winner) {
                found = true;
                break;
            }
        }
        require(found, "Winner not in game");

        // Verify expected prize matches fee * multiplier * capacity
        uint256 expectedPrize = (config.entryFee * PRIZE_MULTIPLIER * config.capacity);
        require(tokenPrize == expectedPrize, "Invalid prize amount");

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                RESOLVE_TYPEHASH,
                config.resolver,
                config.entryFee,
                config.capacity,
                gameId,
                winner,
                tokenPrize,
                guessCount
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        require(signer == config.resolver, "Invalid signature");

        gameResolved[configHash][gameId] = true;

        // Calculate total reward with bonuses
        uint256 totalReward = _calculateReward(winner, tokenPrize, guessCount);

        // Mint WRDLE tokens to winner
        wordleToken.mint(winner, totalReward);

        // Update stats
        _updatePlayerStats(winner, guessCount);

        emit GameResolved(configHash, gameId, winner, totalReward, guessCount);
    }

    /**
     * @notice Withdraw collected MON fees to treasury
     */
    function withdrawFees() external nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");

        (bool success, ) = treasury.call{value: balance}("");
        require(success, "Transfer failed");

        emit FeesWithdrawn(treasury, balance);
    }

    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function getConfigHash(GameConfig calldata config) public pure returns (bytes32) {
        return keccak256(abi.encode(config.resolver, config.entryFee, config.capacity));
    }

    function getPlayerCount(
        GameConfig calldata config,
        uint256 gameId
    ) external view returns (uint256) {
        bytes32 configHash = getConfigHash(config);
        return gamePlayers[configHash][gameId].length;
    }

    function isPlayerInGame(
        GameConfig calldata config,
        uint256 gameId,
        address player
    ) external view returns (bool) {
        bytes32 configHash = getConfigHash(config);
        address[] storage players = gamePlayers[configHash][gameId];
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == player) return true;
        }
        return false;
    }

    function isGameResolved(
        GameConfig calldata config,
        uint256 gameId
    ) external view returns (bool) {
        bytes32 configHash = getConfigHash(config);
        return gameResolved[configHash][gameId];
    }

    function getExpectedPrize(GameConfig calldata config) external pure returns (uint256) {
        return config.entryFee * PRIZE_MULTIPLIER * config.capacity;
    }

    function getPlayerStats(
        address player
    ) external view returns (
        uint256 wins,
        uint256 gamesPlayed,
        uint256 currentStreak,
        uint256 bestStreak,
        bool hasFirstWin
    ) {
        PlayerStats storage stats = playerStats[player];
        return (
            stats.totalWins,
            stats.totalGamesPlayed,
            stats.currentStreak,
            stats.bestStreak,
            stats.hasFirstWin
        );
    }

    function getStreakMultiplier(address player) public view returns (uint256) {
        PlayerStats storage stats = playerStats[player];
        uint256 today = block.timestamp / 1 days;

        // Check if streak is still valid (won yesterday or today)
        if (stats.lastWinDay < today - 1) {
            return 10000; // 1x (streak broken)
        }

        if (stats.currentStreak >= 7) return STREAK_DAY_7;
        if (stats.currentStreak >= 3) return STREAK_DAY_3;
        if (stats.currentStreak >= 2) return STREAK_DAY_2;
        return 10000; // 1x
    }

    function getWeeklyLeaderboard() external view returns (
        address[] memory players,
        uint256[] memory wins
    ) {
        uint256 currentWeek = block.timestamp / 1 weeks;
        if (_weeklyLeaderboard.weekNumber != currentWeek) {
            return (new address[](0), new uint256[](0));
        }

        players = _weeklyLeaderboard.players;
        wins = new uint256[](players.length);
        for (uint256 i = 0; i < players.length; i++) {
            wins[i] = _weeklyLeaderboard.wins[players[i]];
        }
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _calculateReward(
        address winner,
        uint256 basePrize,
        uint8 guessCount
    ) internal view returns (uint256) {
        PlayerStats storage stats = playerStats[winner];
        uint256 totalReward = basePrize;

        // Apply streak multiplier
        uint256 multiplier = getStreakMultiplier(winner);
        totalReward = (totalReward * multiplier) / 10000;

        // Perfect game bonus (1 guess)
        if (guessCount == 1) {
            totalReward += PERFECT_GAME_BONUS;
        }

        // First win bonus
        if (!stats.hasFirstWin) {
            totalReward += FIRST_WIN_BONUS;
        }

        // Milestone bonuses
        uint256 winsAfter = stats.totalWins + 1;
        if (winsAfter == 10 && !stats.has10Wins) {
            totalReward += MILESTONE_10_BONUS;
        } else if (winsAfter == 50 && !stats.has50Wins) {
            totalReward += MILESTONE_50_BONUS;
        } else if (winsAfter == 100 && !stats.has100Wins) {
            totalReward += MILESTONE_100_BONUS;
        }

        return totalReward;
    }

    function _updatePlayerStats(address player, uint8 guessCount) internal {
        PlayerStats storage stats = playerStats[player];
        uint256 today = block.timestamp / 1 days;

        stats.totalGamesPlayed++;
        stats.totalWins++;

        // Update streak
        if (stats.lastWinDay == today - 1) {
            // Consecutive day
            stats.currentStreak++;
        } else if (stats.lastWinDay != today) {
            // New streak (or first win today)
            stats.currentStreak = 1;
        }
        // If won same day, streak stays the same

        stats.lastWinDay = today;

        if (stats.currentStreak > stats.bestStreak) {
            stats.bestStreak = stats.currentStreak;
        }

        // Mark milestones
        if (!stats.hasFirstWin) stats.hasFirstWin = true;
        if (stats.totalWins == 10) stats.has10Wins = true;
        if (stats.totalWins == 50) stats.has50Wins = true;
        if (stats.totalWins == 100) stats.has100Wins = true;

        // Update weekly leaderboard
        _updateWeeklyLeaderboard(player);
    }

    function _updateWeeklyLeaderboard(address player) internal {
        uint256 currentWeek = block.timestamp / 1 weeks;

        // Reset if new week
        if (_weeklyLeaderboard.weekNumber != currentWeek) {
            // Clear old data
            for (uint256 i = 0; i < _weeklyLeaderboard.players.length; i++) {
                delete _weeklyLeaderboard.wins[_weeklyLeaderboard.players[i]];
            }
            delete _weeklyLeaderboard.players;
            _weeklyLeaderboard.weekNumber = currentWeek;
        }

        // Add player if not already tracked
        if (_weeklyLeaderboard.wins[player] == 0) {
            _weeklyLeaderboard.players.push(player);
        }

        _weeklyLeaderboard.wins[player]++;
    }

    // Allow receiving MON
    receive() external payable {}
}
