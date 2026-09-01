import { useState, useCallback } from 'react';

// ---- Constants ----
const NUM_PLAYERS = 4;
const TOKENS_PER_PLAYER = 4;
const PATH_LENGTH = 52; // standard Ludo
const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47]; // indices of safe cells (example)

// Define path coordinates (row, col) for the main loop
// This must match the board's path cells (we'll define later)
// For now, we just use indices.
const PATH_COORDS = []; // will be filled in Board component, but we keep logic independent.

// Player colours
const COLORS = ['red', 'green', 'yellow', 'blue'];

// Starting index on the path for each player (0-based)
const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };

// Finishing lane length
const FINISH_LENGTH = 6;

// ---- Hook ----
export function useLudoGame() {
  // Players' tokens: each token is { position: 'home' | pathIndex (0-51) | 'finish' | 'done' }
  // home: in base, pathIndex: on the main loop, finish: in finishing lane (0-5), done: reached center
  const [gameState, setGameState] = useState(() => {
    const players = COLORS.map(color => ({
      color,
      tokens: Array(TOKENS_PER_PLAYER).fill().map(() => ({ position: 'home' })),
      finished: 0, // count of tokens that have reached center
    }));
    return {
      players,
      currentPlayer: 0, // index into players array
      diceValue: null,
      phase: 'roll', // 'roll' | 'select' | 'moving'
      canRoll: true,
    };
  });

  const rollDice = useCallback(() => {
    const value = Math.floor(Math.random() * 6) + 1;
    setGameState(prev => ({
      ...prev,
      diceValue: value,
      phase: 'select',
      canRoll: false,
    }));
    // After roll, player must select a token to move
  }, []);

  // Move a token from its current position by steps
  const moveToken = useCallback((playerIndex, tokenIndex) => {
    const player = gameState.players[playerIndex];
    const token = player.tokens[tokenIndex];
    const steps = gameState.diceValue;
    let newPos;

    if (token.position === 'home') {
      // Can only move out if dice is 6
      if (steps !== 6) return false;
      newPos = START_INDEX[player.color];
    } else if (typeof token.position === 'number') {
      let pos = token.position + steps;
      if (pos >= PATH_LENGTH) {
        // Enter finishing lane if dice lands exactly on or beyond?
        // In Ludo, you must enter finishing lane exactly, you can't overshoot.
        // We'll simplify: if pos >= PATH_LENGTH, we check if it can enter finish.
        // Standard: each player has their own finishing lane starting at PATH_LENGTH - something.
        // We'll implement later.
        // For now, allow overflow.
      }
      newPos = pos % PATH_LENGTH;
    } else if (token.position === 'finish') {
      // Already in finishing lane, move further
    } else {
      return false;
    }

    // Check capture, safe, etc.
    // Update token position
    // ... (complex logic)
    // We'll implement a simplified version for brevity

    return true;
  }, [gameState]);

  // ... more functions (select token, next turn, capture, check win)

  // Return state and actions
  return {
    gameState,
    rollDice,
    moveToken,
    // ...
  };
}
