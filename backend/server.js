require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { ethers } = require('ethers');

const app = express();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3001;
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY;
// TODO: Update after deploying to Avalanche Fuji
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
const CHAIN_ID = 43113; // Avalanche Fuji Testnet
const RPC_URL = process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';

// Security: Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  // Production: set FRONTEND_URL env var in App Runner
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
];

// Rate limiting config
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const rateLimitMap = new Map(); // IP -> { count, resetTime }

// Word list - kept secret on server (expand to 400+ for production)
const WORDS = [
  'CHAIN',
];

// Server secret for randomizing words (generate once on deploy, keep constant)
const SERVER_SECRET = process.env.SERVER_SECRET || crypto.randomBytes(32).toString('hex');

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

// Health check - MUST be before CORS middleware for App Runner health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// CORS - only allow specific origins
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc) in dev only
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10kb' })); // Limit payload size

// Rate limiting middleware
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  let rateData = rateLimitMap.get(ip);
  if (!rateData || now > rateData.resetTime) {
    rateData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, rateData);
  }

  rateData.count++;

  if (rateData.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Please wait.' });
  }

  next();
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOCKCHAIN CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

const provider = new ethers.JsonRpcProvider(RPC_URL);

const CONTRACT_ABI = [
  'function isPlayerInGame(address resolver, uint256 gameId, address player) view returns (bool)',
  'function isGameResolved(address resolver, uint256 gameId) view returns (bool)',
  'function getCurrentGameId(address resolver) view returns (uint256)',
];

const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

// Active game sessions: sessionId -> session data
const gameSessions = new Map();

// Track which player+gameId combinations have sessions (prevent duplicates)
const playerGameIndex = new Map(); // `${player}-${gameId}` -> sessionId

// Session tokens for authentication
const sessionTokens = new Map(); // sessionId -> token

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function generateSessionId() {
  return ethers.hexlify(ethers.randomBytes(16));
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Secure word selection - uses server secret + gameId + player for randomness
function getWordForGame(gameId, player) {
  const seed = crypto
    .createHash('sha256')
    .update(`${SERVER_SECRET}-${gameId}-${player.toLowerCase()}-${Date.now()}`)
    .digest('hex');

  // Convert first 8 chars of hash to number for index
  const index = parseInt(seed.substring(0, 8), 16) % WORDS.length;
  return WORDS[index];
}

function evaluateGuess(guess, target) {
  const result = [];
  const targetLetters = target.split('');
  const guessLetters = guess.toUpperCase().split('');

  // First pass: mark correct letters
  guessLetters.forEach((letter, i) => {
    if (letter === targetLetters[i]) {
      result[i] = 'correct';
      targetLetters[i] = null;
    }
  });

  // Second pass: mark present/absent letters
  guessLetters.forEach((letter, i) => {
    if (result[i]) return;

    const targetIndex = targetLetters.indexOf(letter);
    if (targetIndex !== -1) {
      result[i] = 'present';
      targetLetters[targetIndex] = null;
    } else {
      result[i] = 'absent';
    }
  });

  return result;
}

// Input validation
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidGuess(guess) {
  return typeof guess === 'string' && /^[A-Za-z]{5}$/.test(guess);
}

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && /^0x[a-fA-F0-9]{32}$/.test(sessionId);
}

// Verify session token
function verifySessionToken(sessionId, token) {
  const storedToken = sessionTokens.get(sessionId);
  if (!storedToken || !token) return false;
  // Ensure same length for timing-safe comparison
  if (storedToken.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(storedToken), Buffer.from(token));
  } catch {
    return false;
  }
}

// Sign game result for WordleRoyaleFree contract
async function signGameResult(resolver, gameId, winner, guessCount) {
  if (!RESOLVER_PRIVATE_KEY) {
    throw new Error('RESOLVER_PRIVATE_KEY not configured');
  }

  const wallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY);

  const domain = {
    name: 'WordleRoyaleFree',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: CONTRACT_ADDRESS,
  };

  const types = {
    Resolve: [
      { name: 'resolver', type: 'address' },
      { name: 'gameId', type: 'uint256' },
      { name: 'winner', type: 'address' },
      { name: 'guessCount', type: 'uint8' },
    ],
  };

  const message = {
    resolver: resolver,
    gameId: BigInt(gameId),
    winner: winner,
    guessCount: guessCount,
  };

  const signature = await wallet.signTypedData(domain, types, message);
  return signature;
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// Get resolver address
app.get('/api/resolver', (req, res) => {
  if (!RESOLVER_PRIVATE_KEY) {
    return res.status(500).json({ error: 'Resolver not configured' });
  }
  const wallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY);
  res.json({ resolver: wallet.address });
});

// Start a new game session
app.post('/api/game/start', async (req, res) => {
  try {
    const { player, gameId } = req.body;

    // Input validation
    if (!player || !isValidAddress(player)) {
      return res.status(400).json({ error: 'Invalid player address' });
    }
    if (gameId === undefined || isNaN(Number(gameId)) || Number(gameId) < 0) {
      return res.status(400).json({ error: 'Invalid gameId' });
    }

    const playerLower = player.toLowerCase();
    const gameIdStr = gameId.toString();

    // Check if player already has a session for this game
    const existingKey = `${playerLower}-${gameIdStr}`;
    if (playerGameIndex.has(existingKey)) {
      const existingSessionId = playerGameIndex.get(existingKey);
      const existingSession = gameSessions.get(existingSessionId);
      if (existingSession && !existingSession.completed) {
        // Return existing session
        return res.json({
          sessionId: existingSessionId,
          token: sessionTokens.get(existingSessionId),
          wordLength: existingSession.word.length,
          maxGuesses: 6,
          guessCount: existingSession.guesses.length,
        });
      }
    }

    // Create new session
    const sessionId = generateSessionId();
    const sessionToken = generateSessionToken();
    const word = getWordForGame(gameIdStr, playerLower);

    gameSessions.set(sessionId, {
      player: playerLower,
      gameId: gameIdStr,
      word,
      guesses: [],
      startTime: Date.now(),
      completed: false,
      won: false,
      claimed: false,
    });

    sessionTokens.set(sessionId, sessionToken);
    playerGameIndex.set(existingKey, sessionId);

    console.log(`Game started: session=${sessionId}, gameId=${gameIdStr}, player=${playerLower}`);

    res.json({
      sessionId,
      token: sessionToken, // Client must include this in subsequent requests
      wordLength: word.length,
      maxGuesses: 6,
    });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

// Submit a guess
app.post('/api/game/guess', (req, res) => {
  try {
    const { sessionId, guess, token } = req.body;

    // Input validation
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    if (!isValidGuess(guess)) {
      return res.status(400).json({ error: 'Guess must be exactly 5 letters (A-Z)' });
    }

    const session = gameSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify session token
    if (!verifySessionToken(sessionId, token)) {
      return res.status(403).json({ error: 'Invalid session token' });
    }

    if (session.completed) {
      return res.status(400).json({ error: 'Game already completed' });
    }

    const upperGuess = guess.toUpperCase();

    // Accept any 5-letter word (no dictionary validation)
    const result = evaluateGuess(upperGuess, session.word);
    session.guesses.push({ guess: upperGuess, result, timestamp: Date.now() });

    const isCorrect = upperGuess === session.word;
    const isGameOver = isCorrect || session.guesses.length >= 6;

    if (isGameOver) {
      session.completed = true;
      session.won = isCorrect;
      session.endTime = Date.now();
    }

    console.log(`Guess: session=${sessionId}, guess=${upperGuess}, correct=${isCorrect}`);

    res.json({
      guess: upperGuess,
      result,
      guessNumber: session.guesses.length,
      isCorrect,
      isGameOver,
      won: session.won,
      ...(isGameOver && { word: session.word }),
    });
  } catch (error) {
    console.error('Error processing guess:', error);
    res.status(500).json({ error: 'Failed to process guess' });
  }
});

// Get game state
app.get('/api/game/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { token } = req.query;

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = gameSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Verify session token
  if (!verifySessionToken(sessionId, token)) {
    return res.status(403).json({ error: 'Invalid session token' });
  }

  res.json({
    guesses: session.guesses.map(g => ({ guess: g.guess, result: g.result })),
    completed: session.completed,
    won: session.won,
    guessCount: session.guesses.length,
    ...(session.completed && { word: session.word }),
  });
});

// Request signature for winning game
app.post('/api/game/claim', async (req, res) => {
  try {
    const { sessionId, token } = req.body;

    // Input validation
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const session = gameSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify session token
    if (!verifySessionToken(sessionId, token)) {
      return res.status(403).json({ error: 'Invalid session token' });
    }

    if (!session.completed) {
      return res.status(400).json({ error: 'Game not completed' });
    }

    if (!session.won) {
      return res.status(400).json({ error: 'Game was not won' });
    }

    if (session.claimed) {
      return res.status(400).json({ error: 'Reward already claimed' });
    }

    // Get resolver address
    const resolverWallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY);
    const resolver = resolverWallet.address;

    // Verify on-chain that game isn't already resolved
    try {
      const isResolved = await contract.isGameResolved(resolver, session.gameId);
      if (isResolved) {
        session.claimed = true;
        return res.status(400).json({ error: 'Game already resolved on-chain' });
      }
    } catch (err) {
      console.warn('On-chain resolution check failed:', err.message);
      // Continue anyway for testing, but log it
    }

    const guessCount = session.guesses.length;

    const signature = await signGameResult(
      resolver,
      session.gameId,
      session.player,
      guessCount
    );

    session.claimed = true;

    console.log(`Claim signed: session=${sessionId}, player=${session.player}, guesses=${guessCount}`);

    res.json({
      signature,
      resolver,
      winner: session.player,
      guessCount,
      gameId: session.gameId,
    });
  } catch (error) {
    console.error('Error signing claim:', error);
    res.status(500).json({ error: 'Failed to sign claim' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

// Clean up old sessions and rate limit data
setInterval(() => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();

  // Clean up sessions
  for (const [sessionId, session] of gameSessions) {
    if (now - session.startTime > ONE_HOUR) {
      gameSessions.delete(sessionId);
      sessionTokens.delete(sessionId);
      playerGameIndex.delete(`${session.player}-${session.gameId}`);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }

  // Clean up rate limit data
  for (const [ip, data] of rateLimitMap) {
    if (now > data.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 60000);

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           WORDLANCHE - BACKEND SERVER                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Status:    Running                                           ║
║  Port:      ${PORT}                                              ║
║  Contract:  ${CONTRACT_ADDRESS}      ║
║  Chain:     Avalanche Fuji (${CHAIN_ID})                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Model:     FREE TO PLAY - WRDL prizes from pool           ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  if (!RESOLVER_PRIVATE_KEY) {
    console.warn('WARNING: RESOLVER_PRIVATE_KEY not set in .env');
  }
  if (SERVER_SECRET === process.env.SERVER_SECRET) {
    console.log('Using configured SERVER_SECRET');
  } else {
    console.warn('WARNING: Using random SERVER_SECRET (will change on restart)');
    console.warn('   Set SERVER_SECRET in .env for consistent word selection');
  }
});
