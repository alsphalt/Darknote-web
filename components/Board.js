'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSocket } from '@/contexts/SocketContext';
import styles from './Board.module.css';

// Dynamically import 3D dice (no SSR)
const Dice3D = dynamic(() => import('@/components/Dice3D'), { ssr: false });

// ---- Board Constants ----
const SIZE = 15;

// Path coordinates (52 cells clockwise)
const PATH_COORDS = (() => {
  const path = [];
  for (let r = 6; r >= 1; r--) path.push([r, 1]);
  for (let c = 1; c <= 7; c++) path.push([1, c]);
  for (let r = 2; r <= 7; r++) path.push([r, 7]);
  for (let c = 7; c <= 13; c++) path.push([7, c]);
  for (let r = 8; r <= 13; r++) path.push([r, 13]);
  for (let c = 12; c >= 7; c--) path.push([13, c]);
  for (let r = 12; r >= 7; r--) path.push([r, 7]);
  for (let c = 6; c >= 1; c--) path.push([7, c]);
  return path;
})();

function isPathCell(row, col) {
  return PATH_COORDS.some(([r, c]) => r === row && c === col);
}

function getCellType(row, col) {
  if (row < 6 && col < 6) return 'home-red';
  if (row < 6 && col >= 9) return 'home-green';
  if (row >= 9 && col >= 9) return 'home-yellow';
  if (row >= 9 && col < 6) return 'home-blue';
  if (col === 7 && row >= 1 && row <= 5) return 'finish-red';
  if (row === 7 && col >= 9 && col <= 13) return 'finish-green';
  if (col === 7 && row >= 9 && row <= 13) return 'finish-yellow';
  if (row === 7 && col >= 1 && col <= 5) return 'finish-blue';
  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) return 'centre';
  if (isPathCell(row, col)) return 'path';
  return 'empty';
}

function getCellBg(row, col) {
  const type = getCellType(row, col);
  switch (type) {
    case 'home-red': return '#e74c3c';
    case 'home-green': return '#2ecc71';
    case 'home-yellow': return '#f1c40f';
    case 'home-blue': return '#3498db';
    case 'finish-red': return '#e74c3c';
    case 'finish-green': return '#2ecc71';
    case 'finish-yellow': return '#f1c40f';
    case 'finish-blue': return '#3498db';
    case 'centre': return '#ffffff';
    case 'path': return '#fdf5e6';
    default: return '#ddd';
  }
}

// ---- Helper: get token coordinates from game state ----
function getTokenPosition(token, playerColor) {
  if (typeof token.position === 'number') {
    return PATH_COORDS[token.position] || null;
  }
  if (token.position === 'home') return null;
  if (token.position === 'done') return [7, 7];
  if (typeof token.position === 'string' && token.position.startsWith('finish-')) {
    const idx = parseInt(token.position.split('-')[1], 10);
    // Map finish lane to appropriate coordinates
    // For simplicity we place them near the centre; you can refine with exact lane positions.
    // For now, return centre area.
    return [7, 7];
  }
  return null;
}

// ---- Compute which tokens are movable (simplified) ----
function getMovableTokens(gameState, currentPlayerIndex) {
  if (!gameState || gameState.phase !== 'select') return [];
  const player = gameState.players[currentPlayerIndex];
  if (!player) return [];
  const steps = gameState.diceValue;
  if (!steps) return [];

  const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };
  const FINISH_LENGTH = 6;
  const PATH_LENGTH = 52;

  const canMove = (token) => {
    if (token.position === 'done') return false;
    if (token.position === 'home') return steps === 6;
    if (typeof token.position === 'number') {
      const newPos = token.position + steps;
      if (newPos >= PATH_LENGTH) {
        const finishIdx = newPos - PATH_LENGTH;
        return finishIdx < FINISH_LENGTH;
      }
      return true;
    }
    if (typeof token.position === 'string' && token.position.startsWith('finish-')) {
      const finishPos = parseInt(token.position.split('-')[1], 10);
      return finishPos + steps < FINISH_LENGTH;
    }
    return false;
  };

  return player.tokens
    .map((token, idx) => ({ token, idx }))
    .filter(({ token }) => canMove(token))
    .map(({ idx }) => idx);
}

// ---- Main Board Component ----
export default function Board({ roomId }) {
  const { gameState, emit, userId } = useSocket(); // assuming useSocket provides these
  const [theme, setTheme] = useState('classic');
  const [is3D, setIs3D] = useState(false);
  const [movableIndices, setMovableIndices] = useState([]);

  // Find current player's index
  const currentPlayerIndex = useMemo(() => {
    if (!gameState || !userId) return -1;
    return gameState.players.findIndex(p => p.userId === userId);
  }, [gameState, userId]);

  // Update movable indices when game state changes
  useEffect(() => {
    if (gameState && currentPlayerIndex >= 0 && gameState.phase === 'select') {
      const indices = getMovableTokens(gameState, currentPlayerIndex);
      setMovableIndices(indices);
    } else {
      setMovableIndices([]);
    }
  }, [gameState, currentPlayerIndex]);

  // Handlers
  const rollDice = () => {
    if (gameState && gameState.phase === 'roll' && currentPlayerIndex === gameState.currentPlayerIndex) {
      emit('roll-dice', { roomId });
    }
  };

  const selectToken = (tokenIndex) => {
    if (movableIndices.includes(tokenIndex) && currentPlayerIndex === gameState.currentPlayerIndex) {
      emit('move-token', { roomId, tokenIndex });
    }
  };

  // Build grid
  const cells = [];
  if (gameState) {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const type = getCellType(row, col);
        const bg = getCellBg(row, col);
        let tokenOnCell = null;
        let playerIdx = -1;
        let tokenIdx = -1;

        // Search tokens
        for (let p = 0; p < gameState.players.length; p++) {
          const player = gameState.players[p];
          for (let t = 0; t < player.tokens.length; t++) {
            const token = player.tokens[t];
            const coords = getTokenPosition(token, player.color);
            if (coords && coords[0] === row && coords[1] === col) {
              tokenOnCell = { ...token, color: player.color, playerUserId: player.userId };
              playerIdx = p;
              tokenIdx = t;
              break;
            }
          }
          if (tokenOnCell) break;
        }

        const isSelectable = token
