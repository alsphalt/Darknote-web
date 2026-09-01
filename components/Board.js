'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import styles from './Board.module.css';
import { useLudoGame } from '@/hooks/useLudoGame';

// ---- Dynamically import Dice3D (no SSR) ----
const Dice3D = dynamic(() => import('@/components/Dice3D'), { ssr: false });

// ---- Board Constants ----
const SIZE = 15;
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

export default function Board() {
  const { gameState, rollDice, selectToken, getMovableTokens } = useLudoGame();
  const [theme, setTheme] = useState('classic');
  const [is3D, setIs3D] = useState(false);
  const [movableIndices, setMovableIndices] = useState([]);

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
            const color = player.color;
            // Map finish index to actual board coords
            // For simplicity, we'll skip exact placement – we can improve later.
            // For now, just place in centre area to visualise.
            coords = [7, 7];
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

      const isSelectable = tokenOnCell && movableIndices.includes(tokenIndex) && playerIdx === gameState.currentPlayer;

      cells.push({ row, col, type, bg, token: tokenOnCell, isSelectable, playerIdx, tokenIndex });
    }
  }

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
        <Dice3D onRoll={rollDice} />
      </div>

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
