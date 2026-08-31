'use client';

import { useState } from 'react';
import styles from './Dice.module.css';

const DOT_PATTERNS = {
  1: [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
  2: [[1, 0, 0], [0, 0, 0], [0, 0, 1]],
  3: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  4: [[1, 0, 1], [0, 0, 0], [1, 0, 1]],
  5: [[1, 0, 1], [0, 1, 0], [1, 0, 1]],
  6: [[1, 0, 1], [1, 0, 1], [1, 0, 1]],
};

export default function Dice() {
  const [value, setValue] = useState(1);
  const [rolling, setRolling] = useState(false);

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    const newValue = Math.floor(Math.random() * 6) + 1;
    setValue(newValue);
    setTimeout(() => setRolling(false), 400);
  };

  const pattern = DOT_PATTERNS[value];

  return (
    <div className={styles.container}>
      <div className={`${styles.dice} ${rolling ? styles.rolling : ''}`}>
        {pattern.map((row, r) => (
          <div key={r} className={styles.row}>
            {row.map((dot, c) => (
              <div key={c} className={`${styles.dot} ${dot ? styles.filled : ''}`} />
            ))}
          </div>
        ))}
      </div>
      <button className={styles.rollBtn} onClick={roll} disabled={rolling}>
        {rolling ? 'Rolling...' : 'Roll Dice'}
      </button>
    </div>
  );
}
