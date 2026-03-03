/**
 * Security & Functionality Test Suite
 * Tests all backend endpoints and security measures
 */

const API_BASE = 'http://localhost:3001';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(test, passed, details = '') {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${test}${details ? ` - ${details}` : ''}`);
  results.tests.push({ test, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

async function fetch(url, options = {}) {
  const response = await globalThis.fetch(url, options);
  return response;
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('        WORDLE ROYALE SECURITY TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Health check
  console.log('\n--- Basic Endpoints ---');
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    log('Health endpoint', res.ok && data.status === 'ok');
  } catch (e) {
    log('Health endpoint', false, e.message);
  }

  // Test 2: Get resolver
  let resolverAddress;
  try {
    const res = await fetch(`${API_BASE}/api/resolver`);
    const data = await res.json();
    resolverAddress = data.resolver;
    log('Get resolver', res.ok && /^0x[a-fA-F0-9]{40}$/.test(resolverAddress));
  } catch (e) {
    log('Get resolver', false, e.message);
  }

  // Test 3: Input validation - invalid player address
  console.log('\n--- Input Validation ---');
  try {
    const res = await fetch(`${API_BASE}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: 'invalid', gameId: '0', configHash: '0x123' })
    });
    log('Reject invalid player address', res.status === 400);
  } catch (e) {
    log('Reject invalid player address', false, e.message);
  }

  // Test 4: Input validation - missing gameId
  try {
    const res = await fetch(`${API_BASE}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: '0x1234567890123456789012345678901234567890' })
    });
    log('Reject missing gameId', res.status === 400);
  } catch (e) {
    log('Reject missing gameId', false, e.message);
  }

  // Test 5: Start valid game session
  console.log('\n--- Game Session Tests ---');
  const testPlayer = '0x1234567890123456789012345678901234567890';
  let sessionId, sessionToken;

  try {
    const res = await fetch(`${API_BASE}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: testPlayer,
        gameId: '1',
        configHash: '0xabc123'
      })
    });
    const data = await res.json();
    sessionId = data.sessionId;
    sessionToken = data.token;
    log('Start game session',
      res.ok && sessionId && sessionToken && data.wordLength === 5,
      `sessionId: ${sessionId?.slice(0,10)}...`
    );
  } catch (e) {
    log('Start game session', false, e.message);
  }

  // Test 6: Duplicate session returns same session
  try {
    const res = await fetch(`${API_BASE}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: testPlayer,
        gameId: '1',
        configHash: '0xabc123'
      })
    });
    const data = await res.json();
    log('Duplicate session returns existing',
      res.ok && data.sessionId === sessionId,
      'Same sessionId returned'
    );
  } catch (e) {
    log('Duplicate session returns existing', false, e.message);
  }

  // Test 7: Submit guess without token
  console.log('\n--- Session Authentication ---');
  try {
    const res = await fetch(`${API_BASE}/api/game/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guess: 'AVAIL' })
    });
    log('Reject guess without token', res.status === 403);
  } catch (e) {
    log('Reject guess without token', false, e.message);
  }

  // Test 8: Submit guess with wrong token
  try {
    const res = await fetch(`${API_BASE}/api/game/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guess: 'AVAIL', token: 'wrongtoken' })
    });
    log('Reject guess with wrong token', res.status === 403);
  } catch (e) {
    log('Reject guess with wrong token', false, e.message);
  }

  // Test 9: Invalid guess format
  console.log('\n--- Guess Validation ---');
  try {
    const res = await fetch(`${API_BASE}/api/game/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guess: 'AB', token: sessionToken })
    });
    log('Reject guess with wrong length', res.status === 400);
  } catch (e) {
    log('Reject guess with wrong length', false, e.message);
  }

  // Test 10: Invalid guess characters
  try {
    const res = await fetch(`${API_BASE}/api/game/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guess: 'AB123', token: sessionToken })
    });
    log('Reject guess with numbers', res.status === 400);
  } catch (e) {
    log('Reject guess with numbers', false, e.message);
  }

  // Test 11: Valid guess submission
  let guessResult;
  try {
    const res = await fetch(`${API_BASE}/api/game/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guess: 'HELLO', token: sessionToken })
    });
    guessResult = await res.json();
    log('Accept valid guess',
      res.ok && guessResult.guess === 'HELLO' && Array.isArray(guessResult.result),
      `Result: ${guessResult.result?.join(',')}`
    );
  } catch (e) {
    log('Accept valid guess', false, e.message);
  }

  // Test 12: Try to claim incomplete game
  console.log('\n--- Claim Validation ---');
  try {
    const res = await fetch(`${API_BASE}/api/game/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        config: {
          resolver: resolverAddress,
          entryFee: '10000000000000000',
          capacity: '1'
        },
        token: sessionToken
      })
    });
    log('Reject claim for incomplete game', res.status === 400);
  } catch (e) {
    log('Reject claim for incomplete game', false, e.message);
  }

  // Test 13: Create new session and win it
  console.log('\n--- Full Game Flow ---');
  const testPlayer2 = '0x2234567890123456789012345678901234567890';
  let session2Id, session2Token;

  try {
    const res = await fetch(`${API_BASE}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: testPlayer2,
        gameId: '999',
        configHash: '0xdef456'
      })
    });
    const data = await res.json();
    session2Id = data.sessionId;
    session2Token = data.token;
    log('Start new game for win test', res.ok);
  } catch (e) {
    log('Start new game for win test', false, e.message);
  }

  // Try all possible words to win
  const WORDS = ['AVAIL', 'BLOCK', 'CHAIN', 'TOKEN', 'STAKE', 'CRAFT', 'SMART', 'PROOF', 'VALID', 'NODES'];
  let won = false;
  let winningWord = '';
  let guessCount = 0;

  for (const word of WORDS) {
    if (won) break;
    try {
      const res = await fetch(`${API_BASE}/api/game/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session2Id, guess: word, token: session2Token })
      });
      const data = await res.json();
      guessCount++;
      if (data.isCorrect) {
        won = true;
        winningWord = word;
      }
      if (data.isGameOver && !data.isCorrect) break;
    } catch (e) {
      break;
    }
  }
  log('Win game by guessing', won, `Word was: ${winningWord}, took ${guessCount} guesses`);

  // Test 14: Claim winning game
  let claimSignature;
  if (won) {
    try {
      const res = await fetch(`${API_BASE}/api/game/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session2Id,
          config: {
            resolver: resolverAddress,
            entryFee: '10000000000000000',
            capacity: '1'
          },
          token: session2Token
        })
      });
      const data = await res.json();
      claimSignature = data.signature;
      log('Claim winning signature',
        res.ok && data.signature && data.payout === '10000000000000000',
        `Payout: ${data.payout}, GuessCount: ${data.guessCount}`
      );
    } catch (e) {
      log('Claim winning signature', false, e.message);
    }

    // Test 15: Double claim prevention
    try {
      const res = await fetch(`${API_BASE}/api/game/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session2Id,
          config: {
            resolver: resolverAddress,
            entryFee: '10000000000000000',
            capacity: '1'
          },
          token: session2Token
        })
      });
      log('Prevent double claim', res.status === 400);
    } catch (e) {
      log('Prevent double claim', false, e.message);
    }
  }

  // Test 16: Rate limiting (send many requests)
  console.log('\n--- Rate Limiting ---');
  let rateLimited = false;
  for (let i = 0; i < 35; i++) {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.status === 429) {
        rateLimited = true;
        break;
      }
    } catch (e) {}
  }
  log('Rate limiting works', rateLimited, rateLimited ? 'Got 429 after many requests' : 'No rate limit hit');

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                     TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total:  ${results.passed + results.failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.test}: ${t.details}`);
    });
  }
}

runTests().catch(console.error);
