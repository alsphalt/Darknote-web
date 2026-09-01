'use client';

import { useState } from 'react';
import styles from './Board.module.css';
import Dice3D from './Dice3D';

const SIZE = 15;

// Helper: Is cell part of the cross (path)?
const isPath = (row, col) => (row >= 6 && row <= 8) || (col >= 6 && col <= 8);

// Helper: Determine cell type and background colour
const getCellInfo = (row, col) => {
  // Home bases
  if (row < 6 && col < 6) return { type: 'home-red', bg: '#e74c3c' };
  if (row < 6 && col >= 9) return { type: 'home-green', bg: '#2ecc71' };
  if (row >= 9 && col >= 9) return { type: 'home-yellow', bg: '#f1c40f' };
  if (row >= 9 && col < 6) return { type: 'home-blue', bg: '#3498db' };

  // Central area (white)
  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) {
    return { type: 'centre', bg: '#ffffff' };
  }

  // Path cells
  if (isPath(row, col)) {
    // Determine path colour (usually white/off‑white)
    return { type: 'path', bg: '#fdf5e6' };
  }

  // Should not happen
  return { type: 'empty', bg: '#ccc' };
};

// Pre‑define safe spots (optional)
const safeSpots = [
  [1, 6], [2, 7], [3, 8], // etc. – we'll just mark with a class later
];

// Initial tokens (4 per player, placed in home bases)
const initialTokens = () => {
  const tokens = [];
  const placements = {
    red:   [[1,1], [2,1], [1,2], [2,2]],
    green: [[1,10],[2,10],[1,11],[2,11]],
    yellow:[[10,10],[11,10],[10,11],[11,11]],
    blue:  [[10,1],[11,1],[10,2],[11,2]],
  };
  let id = 0;
  for (const [colour, positions] of Object.entries(placements)) {
    for (const [r, c] of positions) {
      tokens.push({ id: id++, colour, row: r, col: c });
    }
  }
  return tokens;
};

export default function Board() {
  const [tokens] = useState(initialTokens());
  const [theme, setTheme] = useState('classic'); // 'classic', 'neon', 'wooden'
  const [is3D, setIs3D] = useState(false);

  // Build grid
  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const { type, bg } = getCellInfo(row, col);
      const token = tokens.find(t => t.row === row && t.col === col);
      cells.push({ row, col, bg, type, token });
    }
  }

  return (
    <div className={`${styles.boardWrapper} ${styles[theme]} ${is3D ? styles.mode3D : ''}`}>
      <div className={styles.board}>
        {cells.map(({ row, col, bg, type, token }) => (
          <div
            key={`${row}-${col}`}
            className={`${styles.cell} ${styles[type]}`}
            style={{ backgroundColor: bg }}
          >
            {token && (
              <div
                className={`${styles.token} ${styles[token.colour]}`}
                style={{ backgroundColor: token.colour }}
              />
            )}
            {/* Optional: mark safe spots with a small dot */}
            {/* (we'll skip for simplicity) */}
          </div>
        ))}
        {/* 3D Dice placed in the centre */}
        <Dice3D />
      </div>

      {/* Controls for theme and 3D mode */}
      <div className={styles.controls}>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="classic">Classic</option>
          <option value="neon">Neon</option>
          <option value="wooden">Wooden</option>
        </select>
        <button onClick={() => setIs3D(!is3D)}>
          {is3D ? '2D Mode' : '3D Mode'}
        </button>
      </div>
    </div>
  );
}
