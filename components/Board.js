'use client';

import { useState } from 'react';
import styles from './Board.module.css';

const SIZE = 15;

// Define colors for home bases
const COLORS = {
  red: '#e74c3c',
  green: '#2ecc71',
  yellow: '#f1c40f',
  blue: '#3498db',
  path: '#fdf5e6',
  center: '#ffffff',
};

// Determine cell color based on row/col
function getCellColor(row, col) {
  const isRed = row < 6 && col < 6;
  const isGreen = row < 6 && col >= 9;
  const isYellow = row >= 9 && col >= 9;
  const isBlue = row >= 9 && col < 6;
  const isTopPath = row < 6 && col >= 6 && col <= 8;
  const isLeftPath = row >= 6 && row <= 8 && col < 6;
  const isRightPath = row >= 6 && row <= 8 && col >= 9;
  const isBottomPath = row >= 9 && col >= 6 && col <= 8;
  const isCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;

  if (isRed) return COLORS.red;
  if (isGreen) return COLORS.green;
  if (isYellow) return COLORS.yellow;
  if (isBlue) return COLORS.blue;
  if (isTopPath || isLeftPath || isRightPath || isBottomPath) return COLORS.path;
  if (isCenter) return COLORS.center;
  return '#ddd'; // fallback
}

export default function Board() {
  // Example tokens – each with color and position (row, col)
  const [tokens] = useState([
    { id: 1, color: 'red', row: 2, col: 2 },
    { id: 2, color: 'red', row: 3, col: 3 },
    { id: 3, color: 'green', row: 2, col: 12 },
    { id: 4, color: 'green', row: 3, col: 11 },
    { id: 5, color: 'yellow', row: 12, col: 12 },
    { id: 6, color: 'yellow', row: 11, col: 11 },
    { id: 7, color: 'blue', row: 12, col: 2 },
    { id: 8, color: 'blue', row: 11, col: 3 },
    // One token on the path for demo
    { id: 9, color: 'red', row: 6, col: 7 },
  ]);

  // Build grid
  const cells = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const color = getCellColor(row, col);
      // Check if a token is on this cell
      const token = tokens.find(t => t.row === row && t.col === col);
      cells.push({ row, col, color, token });
    }
  }

  return (
    <div className={styles.board}>
      {cells.map(({ row, col, color, token }) => (
        <div
          key={`${row}-${col}`}
          className={styles.cell}
          style={{ backgroundColor: color }}
        >
          {token && (
            <div
              className={styles.token}
              style={{ backgroundColor: COLORS[token.color] }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
