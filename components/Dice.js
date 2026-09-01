'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './Dice.module.css';

// Face configurations: [rotationX, rotationY, rotationZ]
const FACE_ROTATIONS = {
  1: { x: 0, y: 0, z: 0 },
  2: { x: 0, y: -90, z: 0 },
  3: { x: 0, y: 0, z: -90 },
  4: { x: 0, y: 0, z: 90 },
  5: { x: -90, y: 0, z: 0 },
  6: { x: 0, y: 90, z: 0 },
};

// Dot patterns for each face (3x3 grid)
const DOT_PATTERNS = {
  1: [[0,0,0],[0,1,0],[0,0,0]],
  2: [[1,0,0],[0,0,0],[0,0,1]],
  3: [[1,0,0],[0,1,0],[0,0,1]],
  4: [[1,0,1],[0,0,0],[1,0,1]],
  5: [[1,0,1],[0,1,0],[1,0,1]],
  6: [[1,0,1],[1,0,1],[1,0,1]],
};

export default function Dice() {
  const [value, setValue] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });

  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const diceRef = useRef(null);

  // Roll the dice – animate to a random face
  const roll = () => {
    if (rolling) return;
    setRolling(true);
    const newValue = Math.floor(Math.random() * 6) + 1;
    setValue(newValue);

    // Random extra spins for visual effect
    const extraSpins = {
      x: (Math.floor(Math.random() * 4) + 1) * 360,
      y: (Math.floor(Math.random() * 4) + 1) * 360,
      z: (Math.floor(Math.random() * 4) + 1) * 360,
    };

    // Target rotation for the new face
    const target = FACE_ROTATIONS[newValue];
    setRotation({
      x: target.x + extraSpins.x,
      y: target.y + extraSpins.y,
      z: target.z + extraSpins.z,
    });

    setTimeout(() => setRolling(false), 600);
  };

  // --- Drag handlers ---
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const rect = diceRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    const rect = diceRef.current.getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    });
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragOffset.x,
        y: touch.clientY - dragOffset.y,
      });
      e.preventDefault(); // Prevent scrolling while dragging
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragOffset]);

  // Build face component with dots
  const Face = ({ faceValue }) => {
    const pattern = DOT_PATTERNS[faceValue];
    return (
      <div className={styles.face}>
        {pattern.map((row, r) => (
          <div key={r} className={styles.row}>
            {row.map((dot, c) => (
              <div key={c} className={`${styles.dot} ${dot ? styles.filled : ''}`} />
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className={styles.diceContainer}
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      ref={diceRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <div className={styles.diceWrapper}>
        <div
          className={`${styles.dice} ${rolling ? styles.rolling : ''}`}
          style={{
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
          }}
        >
          <div className={styles.faceContainer}>
            {/* Each face is positioned absolutely inside the cube */}
            <div className={`${styles.face} ${styles.front}`}><Face faceValue={1} /></div>
            <div className={`${styles.face} ${styles.back}`}><Face faceValue={6} /></div>
            <div className={`${styles.face} ${styles.left}`}><Face faceValue={3} /></div>
            <div className={`${styles.face} ${styles.right}`}><Face faceValue={4} /></div>
            <div className={`${styles.face} ${styles.top}`}><Face faceValue={2} /></div>
            <div className={`${styles.face} ${styles.bottom}`}><Face faceValue={5} /></div>
          </div>
        </div>
      </div>
      <button className={styles.rollBtn} onClick={roll} disabled={rolling}>
        {rolling ? 'Rolling...' : 'Roll Dice'}
      </button>
    </div>
  );
}
