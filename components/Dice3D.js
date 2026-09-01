'use client';

import { useRef, useState, useEffect } from 'react';
import styles from './Dice3D.module.css';

// ... (dot patterns, face config as before)

export default function Dice3D({ onRoll }) {
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startSwipe, setStartSwipe] = useState(null);
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [momentumId, setMomentumId] = useState(null);
  const [topFace, setTopFace] = useState(1);

  // ... (swipe logic, momentum, rotation update) same as before

  // But we need to call onRoll when user taps (not swipes) or when we want to roll
  // We can add a click/tap handler that triggers roll
  const handleClick = (e) => {
    // Only trigger roll if not dragging
    if (!isDragging) {
      onRoll && onRoll();
    }
  };

  return (
    <div
      className={styles.diceContainer}
      onMouseDown={handleDragStart}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <div className={styles.dice} style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)` }}>
        {/* faces */}
      </div>
      <div className={styles.result}>🎲 {topFace}</div>
    </div>
  );
}
