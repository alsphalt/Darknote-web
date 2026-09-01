'use client';

import { useState } from 'react';
import styles from './Board.module.css';
import Dice3D from './Dice3D';

const SIZE = 15;

// Define player colours and their home base positions (top‑left, top‑right, bottom‑right, bottom‑left)
const PLAYERS = {
  red: { homeRow: 0, homeCol: 0, pathStart: 6, pathEnd: 6, homeColIndex: 6, safeSpots: [] },
  green: { homeRow: 0, homeCol: 9, pathStart: 6, pathEnd: 6, homeColIndex: 8, safeSpots: [] },
  yellow: { homeRow: 9, homeCol: 9, pathStart: 8, pathEnd: 8, homeColIndex: 8, safeSpots: [] },
  blue: { homeRow: 9, homeCol: 0, pathStart: 8, pathEnd: 8, homeColIndex: 6, safeSpots: [] },
};

// Helper to check if a cell is a path cell (the cross)
const isPathCell = (row, col) => {
  // The cross: middle row (6,7,8) OR middle column (6,7,8)
  return (row >= 6 && row <= 8) || (col >= 6 && col <= 8);
};

// Helper to get the colour for a cell (for background)
const getCellColour = (row, col) => {
  // Home bases: 6x6 squares
  if (row < 6 && col < 6) return '#e74c3c'; // Red
  if (row < 6 && col >= 9) return '#2ecc71'; // Green
  if (row >= 9 && col >= 9) return '#f1c40f'; // Yellow
  if (row >= 9 && col < 6) return '#3498db'; // Blue
  // Path cells
  if (isPathCell(row, col)) {
    // Determine colour based on the quadrant for path coloring
    // We'll colour the path segments according to the player's colour
    // For simplicity, we'll make the path white with coloured borders later
    return '#fdf5e6'; // off‑white
  }
  // Center (the home column)
  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) {
    return '#ffffff'; // white centre
  }
  // Default (should not happen)
  return '#ccc';
};

// Map each cell to a class for styling (home, path, centre, etc.)
const getCellType = (row, col) => {
  if (row < 6 && col < 6) return 'home-red';
  if (row < 6 && col >= 9) return 'home-green';
  if (row >= 9 && col >= 9) return 'home-yellow';
  if (row >= 9 && col < 6) return 'home-blue';
  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) return 'centre';
  // Path: we can further distinguish safe spots later
  if (isPathCell(row, col)) return 'path';
  return 'empty';
};

// Initial token positions (home bases)
const getInitialTokens = () => {
  const tokens = [];
  // Each player gets 4 tokens placed in their home base
  const placements = {
    red: [[1,1], [2,1], [1,2], [2,2]],
    green: [[1,10], [2,10], [1,11], [2,11]],
    yellow: [[10,10], [11,10], [10,11], [11,11]],
    blue: [[10,1], [11,1], [10,2], [11,2]],
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
  const [tokens] = useState(getInitialTokens());
  const [theme, setTheme] = useState('classic'); // 'classic', 'neon', 'wooden'
  const [is3D, setIs3D] = useState(false);

  // Build the grid
  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const bg = getCellColour(row, col);
      const type = getCellType(row, col);
      // Check if a token is on this cell
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
          </div>
        ))}
        {/* 3D dice placed in the centre */}
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
