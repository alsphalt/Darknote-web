'use client';

import { useRef, useState, useEffect } from 'react';
import styles from './Dice3D.module.css';

const DOT_PATTERNS = {
  1: [[0,0,0],[0,1,0],[0,0,0]],
  2: [[1,0,0],[0,0,0],[0,0,1]],
  3: [[1,0,0],[0,1,0],[0,0,1]],
  4: [[1,0,1],[0,0,0],[1,0,1]],
  5: [[1,0,1],[0,1,0],[1,0,1]],
  6: [[1,0,1],[1,0,1],[1,0,1]],
};

const FACE_CONFIG = [
  { id: 'front',  rx: 0,   ry: 0,   rz: 0 },
  { id: 'back',   rx: 0,   ry: 180, rz: 0 },
  { id: 'left',   rx: 0,   ry: -90, rz: 0 },
  { id: 'right',  rx: 0,   ry: 90,  rz: 0 },
  { id: 'top',    rx: -90, ry: 0,   rz: 0 },
  { id: 'bottom', rx: 90,  ry: 0,   rz: 0 },
];

const FACE_VALUE = { front: 1, back: 6, left: 3, right: 4, top: 2, bottom: 5 };

export default function Dice3D({ onRoll }) {
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startSwipe, setStartSwipe] = useState(null);
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [momentumId, setMomentumId] = useState(null);
  const [topFace, setTopFace] = useState(1);

  // ---- Drag handlers (defined before they are used) ----
  const handleDragStart = (clientX, clientY) => {
    setIsDragging(true);
    setStartSwipe({ x: clientX, y: clientY });
    if (momentumId) {
      cancelAnimationFrame(momentumId);
      setMomentumId(null);
    }
  };

  const handleDragMove = (clientX, clientY) => {
    if (!isDragging || !startSwipe) return;
    const dx = clientX - startSwipe.x;
    const dy = clientY - startSwipe.y;
    const threshold = 20;
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let dirX = 0, dirY = 0;
      if (absDx > absDy) dirX = Math.sign(dx);
      else dirY = Math.sign(dy);
      setRotation(prev => ({
        x: prev.x + dirY * 90,
        y: prev.y + dirX * 90,
        z: prev.z,
      }));
      setStartSwipe({ x: clientX, y: clientY });
    }
    setVelocity({ x: dx * 0.2, y: dy * 0.2 });
  };

  const handleDragEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      const vx = velocity.x;
      const vy = velocity.y;
      if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
        startMomentum(vx, vy);
      }
      setStartSwipe(null);
      setVelocity({ x: 0, y: 0 });
    }
  };

  const startMomentum = (vx, vy) => {
    if (momentumId) cancelAnimationFrame(momentumId);
    let velX = vx;
    let velY = vy;
    const friction = 0.95;
    const minVel = 0.1;
    const step = () => {
      setRotation(prev => ({
        x: prev.x + velY * 1.5,
        y: prev.y + velX * 1.5,
        z: prev.z,
      }));
      velX *= friction;
      velY *= friction;
      if (Math.abs(velX) < minVel && Math.abs(velY) < minVel) {
        setMomentumId(null);
        return;
      }
      const id = requestAnimationFrame(step);
      setMomentumId(id);
    };
    const id = requestAnimationFrame(step);
    setMomentumId(id);
  };

  // ---- Mouse/Touch event bindings ----
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging) return;
      handleDragMove(e.clientX, e.clientY);
    };
    const onMouseUp = () => handleDragEnd();
    const onTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
      e.preventDefault();
    };
    const onTouchEnd = () => handleDragEnd();

    if (isDragging) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    } else {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    }
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, momentumId]); // added momentumId dependency

  // ---- Compute top face number (simplified) ----
  useEffect(() => {
    const rx = ((rotation.x % 360) + 360) % 360;
    const ry = ((rotation.y % 360) + 360) % 360;
    let face = 1;
    if (rx >= 45 && rx < 135) face = 2;
    else if (rx >= 135 && rx < 225) face = 6;
    else if (rx >= 225 && rx < 315) face = 5;
    else if (ry >= 45 && ry < 135) face = 4;
    else if (ry >= 225 && ry < 315) face = 3;
    else face = 1;
    setTopFace(face);
  }, [rotation]);

  // ---- Click to roll ----
  const handleClick = () => {
    if (!isDragging && onRoll) {
      onRoll();
    }
  };

  // ---- Render face component ----
  const Face = ({ value }) => {
    const pattern = DOT_PATTERNS[value] || DOT_PATTERNS[1];
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
      onMouseDown={(e) => {
        if (e.button === 0) {
          handleDragStart(e.clientX, e.clientY);
          e.preventDefault();
        }
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (touch) {
          handleDragStart(touch.clientX, touch.clientY);
          e.preventDefault();
        }
      }}
      onClick={handleClick}
    >
      <div
        className={styles.dice}
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
        }}
      >
        {FACE_CONFIG.map((face) => {
          const val = FACE_VALUE[face.id];
          return (
            <div key={face.id} className={`${styles.face} ${styles[face.id]}`}>
              <Face value={val} />
            </div>
          );
        })}
      </div>
      <div className={styles.result}>🎲 {topFace}</div>
    </div>
  );
}
