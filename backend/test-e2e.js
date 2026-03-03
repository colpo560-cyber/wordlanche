/**
 * End-to-End Test - Full game flow including on-chain transactions
 * Uses the provided private key to test the complete game cycle
 */

require('dotenv').config();
const { ethers } = require('ethers');

const API_BASE = 'http://localhost:3001';
const RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc';
const CONTRACT_ADDRESS = '0xEaA8E77E6C53fec28D60EEb64533a001b8F413b1';

const CONTRACT_ABI = [
  'function join((address resolver, uint256 entryFee, uint256 capacity) config) payable',
  'function resolve((address resolver, uint256 entryFee, uint256 capacity) config, uint256 gameId, address winner, uint256 payout, uint8 guessCount, bytes signature)',
  'function currentGameId(bytes32 configHash) view returns (uint256)',
  'function getConfigHash((address resolver, uint256 entryFee, uint256 capacity) config) pure returns (bytes32)',
  'function isPlayerInGame((address resolver, uint256 entryFee, uint256 capacity) config, uint256 gameId, address player) view returns (bool)',
  'function getPrizePool((address resolver, uint256 entryFee, uint256 capacity) config, uint256 gameId) view returns (uint256)',
  'function isGameResolved((address resolver, uint256 entryFee, uint256 capacity) config, uint256 gameId) view returns (bool)',
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('        WORDLE ROYALE END-TO-END TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Setup
  const privateKey = process.env.RESOLVER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('ERROR: RESOLVER_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  console.log(`Wallet Address: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet Balance: ${ethers.formatEther(balance)} MON`);

  if (balance < ethers.parseEther('0.02')) {
    console.error('ERROR: Insufficient balance. Need at least 0.02 MON');
    process.exit(1);
  }

  // Step 1: Get resolver from backend
  console.log('\n--- Step 1: Get Resolver ---');
  const resolverRes = await fetch(`${API_BASE}/api/resolver`);
  const { resolver } = await resolverRes.json();
  console.log(`Resolver from backend: ${resolver}`);

  // Create game config
  const config = {
    resolver: resolver,
    entryFee: ethers.parseEther('0.01'),
    capacity: 1n
  };

  console.log('Config:', {
    resolver: config.resolver,
    entryFee: ethers.formatEther(config.entryFee),
    capacity: config.capacity.toString()
  });

  // Step 2: Get current game ID and config hash
  console.log('\n--- Step 2: Check Current State ---');
  const configHash = await contract.getConfigHash(config);
  console.log(`Config Hash: ${configHash}`);

  const currentGameId = await contract.currentGameId(configHash);
  console.log(`Current Game ID: ${currentGameId}`);

  // Step 3: Join game on-chain
  console.log('\n--- Step 3: Join Game On-Chain ---');
  console.log('Sending join transaction...');

  try {
    const joinTx = await contract.join(config, { value: config.entryFee });
    console.log(`Join TX Hash: ${joinTx.hash}`);

    const receipt = await joinTx.wait();
    console.log(`Join confirmed in block ${receipt.blockNumber}`);
  } catch (e) {
    console.error('Join failed:', e.message);
    process.exit(1);
  }

  // Get the game ID we joined
  const newGameId = await contract.currentGameId(configHash);
  const gameId = newGameId > 0n ? newGameId - 1n : 0n;
  console.log(`Joined Game ID: ${gameId}`);

  // Verify we're in the game
  const isInGame = await contract.isPlayerInGame(config, gameId, wallet.address);
  console.log(`Is in game: ${isInGame}`);

  if (!isInGame) {
    console.error('ERROR: Failed to join game');
    process.exit(1);
  }

  // Step 4: Start backend session
  console.log('\n--- Step 4: Start Backend Session ---');
  const startRes = await fetch(`${API_BASE}/api/game/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player: wallet.address,
      gameId: gameId.toString(),
      configHash: configHash
    })
  });
  const session = await startRes.json();
  console.log(`Session ID: ${session.sessionId}`);
  console.log(`Word Length: ${session.wordLength}`);

  const sessionId = session.sessionId;
  const sessionToken = session.token;

  // Step 5: Play the game - try all words
  console.log('\n--- Step 5: Play Game ---');
  const WORDS = ['AVAIL', 'BLOCK', 'CHAIN', 'TOKEN', 'STAKE', 'CRAFT', 'SMART', 'PROOF', 'VALID', 'NODES'];

  let won = false;
  let guessCount = 0;
  let lastResult;

  for (const word of WORDS) {
    const guessRes = await fetch(`${API_BASE}/api/game/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guess: word, token: sessionToken })
    });

    const result = await guessRes.json();
    guessCount++;
    lastResult = result;

    console.log(`Guess ${guessCount}: ${word} -> ${result.result.join(',')}`);

    if (result.isCorrect) {
      won = true;
      console.log(`\nWON! The word was: ${result.word}`);
      break;
    }

    if (result.isGameOver) {
      console.log(`\nGame Over! The word was: ${result.word}`);
      break;
    }
  }

  if (!won) {
    console.log('\nDid not win this game. Skipping claim step.');
    console.log('(This is expected - word is randomized)');
    return;
  }

  // Step 6: Claim signature from backend
  console.log('\n--- Step 6: Get Claim Signature ---');
  const claimRes = await fetch(`${API_BASE}/api/game/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      config: {
        resolver: config.resolver,
        entryFee: config.entryFee.toString(),
        capacity: config.capacity.toString()
      },
      token: sessionToken
    })
  });

  const claim = await claimRes.json();
  console.log(`Signature: ${claim.signature.slice(0, 20)}...`);
  console.log(`Payout: ${ethers.formatEther(claim.payout)} WMON`);
  console.log(`Guess Count: ${claim.guessCount}`);

  // Step 7: Resolve on-chain
  console.log('\n--- Step 7: Resolve On-Chain ---');
  console.log('Sending resolve transaction...');

  try {
    const resolveTx = await contract.resolve(
      config,
      gameId,
      wallet.address,
      BigInt(claim.payout),
      claim.guessCount,
      claim.signature
    );
    console.log(`Resolve TX Hash: ${resolveTx.hash}`);

    const receipt = await resolveTx.wait();
    console.log(`Resolve confirmed in block ${receipt.blockNumber}`);
  } catch (e) {
    console.error('Resolve failed:', e.message);
    process.exit(1);
  }

  // Step 8: Verify resolution
  console.log('\n--- Step 8: Verify ---');
  const isResolved = await contract.isGameResolved(config, gameId);
  console.log(`Game resolved: ${isResolved}`);

  const finalBalance = await provider.getBalance(wallet.address);
  console.log(`Final Balance: ${ethers.formatEther(finalBalance)} MON`);

  // Step 9: Try double claim (should fail)
  console.log('\n--- Step 9: Test Double Claim Prevention ---');
  const doubleClaimRes = await fetch(`${API_BASE}/api/game/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      config: {
        resolver: config.resolver,
        entryFee: config.entryFee.toString(),
        capacity: config.capacity.toString()
      },
      token: sessionToken
    })
  });

  if (doubleClaimRes.status === 400) {
    console.log('Double claim correctly rejected!');
  } else {
    console.error('ERROR: Double claim was not rejected!');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('        TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

runE2ETest().catch(console.error);
