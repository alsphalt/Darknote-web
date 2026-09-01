'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSocket } from '@/contexts/SocketContext';
import styles from './Board.module.css';

// Dynamically import 3D dice (no SSR)
const Dice3D = dynamic(() => import('@/components/Dice3D'), { ssr: false });

// ... (Board constants PATH_COORDS, getCellType, getCellBg, getTokenPosition, getMovableTokens – same as before) ...

export default function Board({ roomId }) {
  const { gameState, emit, userId } = useSocket();
  const [theme, setTheme] = useState('classic');
  const [is3D, setIs3D] = useState(false);
  const [movableIndices, setMovableIndices] = useState([]);
  const [isMuted, setIsMuted] = useState(false);

  // ... (same logic for currentPlayerIndex, movableIndices, rollDice, selectToken, build cells) ...

  return (
    <div className={`${styles.boardWrapper} ${styles[theme]} ${is3D ? styles.mode3D : ''}`}>
      <div className={styles.board}>
        {/* ... cells rendering ... */}
        {!is3D && <Dice3D onRoll={rollDice} is3D={false} isMuted={isMuted} />}
      </div>

      {is3D && (
        <div className={styles.diceArea3D}>
          <Dice3D onRoll={rollDice} is3D={true} isMuted={isMuted} />
        </div>
      )}

      <div className={styles.controls}>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="classic">Classic</option>
          <option value="wooden">Wooden</option>
          <option value="neon">Neon</option>
        </select>
        <button onClick={() => setIs3D(!is3D)}>
          {is3D ? '2D Mode' : '3D Mode'}
        </button>
        <button onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? '🔇' : '🔊'}
        </button>
        <div style={{ color: 'white', fontWeight: 'bold' }}>
          Turn: {gameState?.players[gameState?.currentPlayerIndex]?.color || ''}
        </div>
        <div style={{ color: 'white', fontWeight: 'bold' }}>
          Dice: {gameState?.diceValue || '-'}
        </div>
        {gameState?.winner !== null && (
          <div style={{ color: 'gold', fontWeight: 'bold', fontSize: '1.2rem' }}>
            🏆 {gameState?.players[gameState?.winner]?.color} wins!
          </div>
        )}
      </div>
    </div>
  );
}
