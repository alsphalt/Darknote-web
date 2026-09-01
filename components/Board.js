'use client';

import { useState, useEffect } from 'react';
import styles from './Board.module.css';
import Dice3D from '@/components/Dice3D';
import { useLudoGame } from '@/hooks/useLudoGame';

// ---- Board Constants ----
const SIZE = 15;

// ---- Path coordinates (52 cells in clockwise order) ----
// Starting from Red start (row 6, col 1) going up, then right, then down, then left.
// We'll define them manually.
const PATH_COORDS = (() => {
  const path = [];
  // Red path: from (6,1) up to (1,1)
  for (let r = 6; r >= 1; r--) path.push([r, 1]);
  // Top row right: from (1,1) to (1,7)
  for (let c = 1; c <= 7; c++) path.push([1, c]);
  // Green path: from (1,7) down to (7,7) but we already have (1,7), so start at (2,7)
  for (let r = 2; r <= 7; r++) path.push([r, 7]);
  // Right column down: from (7,7) to (7,13)
  for (let c = 7; c <= 13; c++) path.push([7, c]);
  // Yellow path: from (7,13) down to (13,13)
  for (let r = 8; r <= 13; r++) path.push([r, 13]);
  // Bottom row left: from (13,13) to (13,7)
  for (let c = 12; c >= 7; c--) path.push([13, c]);
  // Blue path: from (13,7) up to (7,7)
  for (let r = 12; r >= 7; r--) path.push([r, 7]);
  // Left column up: from (7,7) to (7,1)
  for (let c = 6; c >= 1; c--) path.push([7, c]);
  // This yields exactly 52 cells (6+7+6+7+6+7+6+7 = 52)
  return path;
})();

// Check if a cell is on the path
function isPathCell(row, col) {
  return PATH_COORDS.some(([r, c]) => r === row && c === col);
}

// Get cell type (home, path, finish, centre)
function getCellType(row, col) {
  if (row < 6 && col < 6) return 'home-red';
  if (row < 6 && col >= 9) return 'home-green';
  if (row >= 9 && col >= 9) return 'home-yellow';
  if (row >= 9 && col < 6) return 'home-blue';
  // Finishing lanes: each player's lane is a column/row leading to centre
  // We'll identify them by specific coordinates
  // Red finishing lane: column 7, rows 1-5 (upward)
  if (col === 7 && row >= 1 && row <= 5) return 'finish-red';
  // Green finishing lane: row 7, cols 9-13 (rightward)
  if (row === 7 && col >= 9 && col <= 13) return 'finish-green';
  // Yellow finishing lane: column 7, rows 9-13 (downward)
  if (col === 7 && row >= 9 && row <= 13) return 'finish-yellow';
  // Blue finishing lane: row 7, cols 1-5 (leftward)
  if (row === 7 && col >= 1 && col <= 5) return 'finish-blue';
  // Centre (the winning spot)
  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) return 'centre';
  // Path (including the cross)
  if (isPathCell(row, col)) return 'path';
  return 'empty';
}

// Get background colour for each cell (for rendering)
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

// Map from token position to grid coordinates
function getTokenCoords(token) {
  if (typeof token.position === 'number') {
    return PATH_COORDS[token.position];
  }
  if (token.position === 'home') return null;
  if (typeof token.position === 'string' && token.position.startsWith('finish-')) {
    const finishIdx = parseInt(token.position.split('-')[1]);
    // Map finish index to coordinates based on player colour
    // We'll need the player's colour – we'll pass it in.
    return null; // handled later
  }
  if (token.position === 'done') return [7, 7]; // centre
  return null;
}

export default function Board() {
  // Use the game hook
  const { gameState, rollDice, selectToken, getMovableTokens } = useLudoGame();
  const [theme, setTheme] = useState('classic');
  const [is3D, setIs3D] = useState(false);
  const [movableIndices, setMovableIndices] = useState([]);

  // Update movable tokens when phase changes
  useEffect(() => {
    if (gameState.phase === 'select') {
      const movable = getMovableTokens();
      setMovableIndices(movable.map(({ idx }) => idx));
    } else {
      setMovableIndices([]);
    }
  }, [gameState, getMovableTokens]);

  // Build grid
  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const type = getCellType(row, col);
      const bg = getCellBg(row, col);
      // Find token at this cell
      let tokenOnCell = null;
      let tokenIndex = -1;
      let playerIdx = -1;
      for (let p = 0; p < gameState.players.length; p++) {
        const player = gameState.players[p];
        for (let t = 0; t < player.tokens.length; t++) {
          const token = player.tokens[t];
          let coords = null;
          if (typeof token.position === 'number') {
            coords = PATH_COORDS[token.position];
          } else if (token.position === 'done') {
            coords = [7, 7];
          } else if (typeof token.position === 'string' && token.position.startsWith('finish-')) {
            const finishIdx = parseInt(token.position.split('-')[1]);
            // Determine finish lane coordinates based on player colour
            const color = player.color;
            // Map finish index to actual board coords
            // We'll predefine finish lanes
            // For simplicity, we'll skip for now and handle later.
          }
          if (coords && coords[0] === row && coords[1] === col) {
            tokenOnCell = { ...token, color: player.color };
            playerIdx = p;
            tokenIndex = t;
            break;
          }
        }
        if (tokenOnCell) break;
      }

      // Check if token is selectable
      const isSelectable = tokenOnCell && movableIndices.includes(tokenIndex) && playerIdx === gameState.currentPlayer;

      cells.push({ row, col, type, bg, token: tokenOnCell, isSelectable, playerIdx, tokenIndex });
    }
  }

  // Handle token click
  const handleTokenClick = (playerIdx, tokenIndex) => {
    if (gameState.phase === 'select' && movableIndices.includes(tokenIndex) && playerIdx === gameState.currentPlayer) {
      selectToken(tokenIndex);
    }
  };

  return (
    <div className={`${styles.boardWrapper} ${styles[theme]} ${is3D ? styles.mode3D : ''}`}>
      <div className={styles.board}>
        {cells.map(({ row, col, type, bg, token, isSelectable, playerIdx, tokenIndex }) => (
          <div
            key={`${row}-${col}`}
            className={`${styles.cell} ${styles[type]} ${isSelectable ? styles.selectable : ''}`}
            style={{ backgroundColor: bg }}
          >
            {token && (
              <div
                className={`${styles.token} ${styles[token.color]} ${isSelectable ? styles.active : ''}`}
                style={{ backgroundColor: token.color }}
                onClick={() => handleTokenClick(playerIdx, tokenIndex)}
              />
            )}
          </div>
        ))}
        {/* 3D Dice in centre */}
        <Dice3D onRoll={rollDice} />
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="classic">Classic</option>
          <option value="neon">Neon</option>
          <option value="wooden">Wooden</option>
        </select>
        <button onClick={() => setIs3D(!is3D)}>
          {is3D ? '2D Mode' : '3D Mode'}
        </button>
        <div style={{ color: 'white', fontWeight: 'bold' }}>
          Turn: {gameState.players[gameState.currentPlayer]?.color || ''}
        </div>
        <div style={{ color: 'white', fontWeight: 'bold' }}>
          Dice: {gameState.diceValue || '-'}
        </div>
        {gameState.winner !== null && (
          <div style={{ color: 'gold', fontWeight: 'bold', fontSize: '1.2rem' }}>
            🏆 {gameState.players[gameState.winner].color} wins!
          </div>
        )}
      </div>
    </div>
  );
}
