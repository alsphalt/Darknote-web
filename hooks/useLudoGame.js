import { useState, useCallback } from 'react';

// ---- Constants ----
const COLORS = ['red', 'green', 'yellow', 'blue'];
const TOKENS_PER_PLAYER = 4;
const PATH_LENGTH = 52;
const FINISH_LENGTH = 6;

// Starting path index for each player
const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };

// Safe cells (path indices where pieces cannot be captured)
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// ---- Helper: Next turn ----
const nextPlayer = (current) => (current + 1) % COLORS.length;

// ---- Main hook ----
export function useLudoGame() {
  // ---- Initialise game state ----
  const [gameState, setGameState] = useState(() => {
    const players = COLORS.map(color => ({
      color,
      tokens: Array(TOKENS_PER_PLAYER).fill().map(() => ({ position: 'home' })),
      finished: 0, // tokens that have reached center
    }));
    return {
      players,
      currentPlayer: 0,
      diceValue: null,
      phase: 'roll', // 'roll' | 'select' | 'moving'
      canRoll: true,
      winner: null,
    };
  });

  // ---- Roll the dice ----
  const rollDice = useCallback(() => {
    if (!gameState.canRoll || gameState.phase !== 'roll' || gameState.winner) return;
    const value = Math.floor(Math.random() * 6) + 1;
    setGameState(prev => ({
      ...prev,
      diceValue: value,
      phase: 'select',
      canRoll: false,
    }));
  }, [gameState]);

  // ---- Check if a token can move ----
  const canMoveToken = useCallback((player, token, steps) => {
    if (token.position === 'done') return false;
    if (token.position === 'home') {
      return steps === 6; // must roll 6 to come out
    }
    if (typeof token.position === 'number') {
      const newPos = token.position + steps;
      // If newPos exactly reaches PATH_LENGTH or beyond, check finishing lane
      if (newPos >= PATH_LENGTH) {
        const finishIndex = newPos - PATH_LENGTH;
        return finishIndex < FINISH_LENGTH; // can enter finish lane if within length
      }
      return true;
    }
    if (typeof token.position === 'string' && token.position.startsWith('finish-')) {
      const finishPos = parseInt(token.position.split('-')[1]);
      return finishPos + steps < FINISH_LENGTH;
    }
    return false;
  }, []);

  // ---- Get movable tokens for current player ----
  const getMovableTokens = useCallback(() => {
    const player = gameState.players[gameState.currentPlayer];
    const steps = gameState.diceValue;
    return player.tokens
      .map((token, idx) => ({ token, idx }))
      .filter(({ token }) => canMoveToken(player, token, steps));
  }, [gameState, canMoveToken]);

  // ---- Select a token to move ----
  const selectToken = useCallback((tokenIndex) => {
    if (gameState.phase !== 'select' || gameState.winner) return;
    const player = gameState.players[gameState.currentPlayer];
    const token = player.tokens[tokenIndex];
    const steps = gameState.diceValue;

    // Check if this token can move
    if (!canMoveToken(player, token, steps)) return;

    // Perform the move
    setGameState(prev => {
      const newPlayers = [...prev.players];
      const newToken = { ...token };
      const playerObj = newPlayers[prev.currentPlayer];

      // Determine new position
      if (newToken.position === 'home') {
        // Must be 6 to leave home
        newToken.position = START_INDEX[playerObj.color];
      } else if (typeof newToken.position === 'number') {
        let newPos = newToken.position + steps;
        if (newPos >= PATH_LENGTH) {
          // Enter finishing lane
          const finishIdx = newPos - PATH_LENGTH;
          if (finishIdx < FINISH_LENGTH) {
            newToken.position = `finish-${finishIdx}`;
          } else {
            // Overshoot – invalid, shouldn't happen because canMoveToken prevented it
            return prev;
          }
        } else {
          newToken.position = newPos;
        }
      } else if (typeof newToken.position === 'string' && newToken.position.startsWith('finish-')) {
        const finishPos = parseInt(newToken.position.split('-')[1]) + steps;
        if (finishPos >= FINISH_LENGTH) {
          // Reached center!
          newToken.position = 'done';
          playerObj.finished += 1;
        } else {
          newToken.position = `finish-${finishPos}`;
        }
      }

      // Check for capture (if on main path and not safe)
      if (typeof newToken.position === 'number') {
        const pos = newToken.position;
        if (!SAFE_CELLS.has(pos)) {
          // Check opponents: if any token on that cell, send it home
          for (let p = 0; p < newPlayers.length; p++) {
            if (p === prev.currentPlayer) continue;
            const opponent = newPlayers[p];
            for (let t = 0; t < opponent.tokens.length; t++) {
              const oppToken = opponent.tokens[t];
              if (typeof oppToken.position === 'number' && oppToken.position === pos) {
                opponent.tokens[t] = { position: 'home' };
              }
            }
          }
        }
      }

      // Update token in player's array
      playerObj.tokens[tokenIndex] = newToken;

      // Check win
      let winner = null;
      if (playerObj.finished === TOKENS_PER_PLAYER) {
        winner = prev.currentPlayer;
      }

      // Determine next phase: if dice is 6, give another turn, else pass turn
      const nextTurn = steps === 6 ? prev.currentPlayer : nextPlayer(prev.currentPlayer);

      return {
        ...prev,
        players: newPlayers,
        currentPlayer: nextTurn,
        phase: 'roll',
        canRoll: true,
        diceValue: null,
        winner,
      };
    });
  }, [gameState, canMoveToken]);

  // ---- Reset game (optional) ----
  const resetGame = useCallback(() => {
    setGameState({
      players: COLORS.map(color => ({
        color,
        tokens: Array(TOKENS_PER_PLAYER).fill().map(() => ({ position: 'home' })),
        finished: 0,
      })),
      currentPlayer: 0,
      diceValue: null,
      phase: 'roll',
      canRoll: true,
      winner: null,
    });
  }, []);

  return {
    gameState,
    rollDice,
    selectToken,
    getMovableTokens,
    resetGame,
  };
}
