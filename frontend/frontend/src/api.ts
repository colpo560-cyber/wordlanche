// Backend API client

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface GameSession {
  sessionId: string;
  token: string; // Session authentication token
  wordLength: number;
  maxGuesses: number;
  guessCount?: number;
}

export interface GuessResult {
  guess: string;
  result: ('correct' | 'present' | 'absent')[];
  guessNumber: number;
  isCorrect: boolean;
  isGameOver: boolean;
  won: boolean;
  word?: string;
}

export interface ClaimResult {
  signature: string;
  winner: string;
  guessCount: number;
  gameId: string;
}

// Get the resolver address from backend
export async function getResolver(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/resolver`);
  if (!res.ok) throw new Error('Failed to get resolver');
  const data = await res.json();
  return data.resolver;
}

// Start a new game session
export async function startGame(
  player: string,
  gameId: bigint
): Promise<GameSession> {
  const res = await fetch(`${API_BASE}/api/game/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player,
      gameId: gameId.toString(),
    }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to start game');
  }
  return res.json();
}

// Submit a guess (requires session token)
export async function submitGuess(
  sessionId: string,
  guess: string,
  token: string
): Promise<GuessResult> {
  const res = await fetch(`${API_BASE}/api/game/guess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, guess, token }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to submit guess');
  }
  return res.json();
}

// Get game state (requires session token)
export async function getGameState(sessionId: string, token: string) {
  const res = await fetch(`${API_BASE}/api/game/${sessionId}?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get game state');
  }
  return res.json();
}

// Claim winning signature from backend (requires session token)
export async function claimSignature(
  sessionId: string,
  token: string
): Promise<ClaimResult> {
  const res = await fetch(`${API_BASE}/api/game/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, token }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to claim signature');
  }
  return res.json();
}
