'use client';

import { useRef, useState, useEffect } from 'react';
import styles from './Dice3D.module.css';

// Face dot patterns (3x3)
const DOT_PATTERNS = {
  1: [[0,0,0],[0,1,0],[0,0,0]],
  2: [[1,0,0],[0,0,0],[0,0,1]],
  3: [[1,0,0],[0,1,0],[0,0,1]],
  4: [[1,0,1],[0,0,0],[1,0,1]],
  5: [[1,0,1],[0,1,0],[1,0,1]],
  6: [[1,0,1],[1,0,1],[1,0,1]],
};

// Face order: front, back, left, right, top, bottom
// Their rotations (in deg) relative to initial cube
const FACE_CONFIG = [
  { id: 'front',  rx: 0,   ry: 0,   rz: 0 },
  { id: 'back',   rx: 0,   ry: 180, rz: 0 },
  { id: 'left',   rx: 0,   ry: -90, rz: 0 },
  { id: 'right',  rx: 0,   ry: 90,  rz: 0 },
  { id: 'top',    rx: -90, ry: 0,   rz: 0 },
  { id: 'bottom', rx: 90,  ry: 0,   rz: 0 },
];

// Map face value to which face is up (for final result)
// We'll compute after rotation.

const Dice3D = ({ boardRef }) => {
  const diceRef = useRef(null);
  const containerRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 }); // offset within dice area
  const [isDragging, setIsDragging] = useState(false);
  const [startSwipe, setStartSwipe] = useState(null);
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [momentumId, setMomentumId] = useState(null);
  const [topFace, setTopFace] = useState(1);

  // Bounds for the dice movement (in px relative to container)
  const MOVE_BOUNDS = 30; // max offset from center
  const DICE_SIZE = 70; // px
  const SWIPE_THRESHOLD = 20; // px to trigger rotation

  // Helper: get current top face value based on rotation
  const getTopFaceValue = (rot) => {
    // Normalize angles to 0-360
    const normalize = (deg) => ((deg % 360) + 360) % 360;
    const rx = normalize(rot.x);
    const ry = normalize(rot.y);
    const rz = normalize(rot.z); // not used for top face detection (since dice only rotates around x and y)
    // Determine top face based on rx and ry
    // Approximate: if rx ~0, front face is up; if rx ~90, top face is up; etc.
    // We'll use a simple check: calculate which face is facing up (0,1,0) in world space after rotation.
    // Since we only rotate around x and y, we can use matrix or simple conditions.
    // For simplicity, we use a mapping based on angle ranges.
    // More robust: use a 3D rotation matrix, but for now we'll assume we only rotate in x and y.

    // We'll compute which face normal is closest to (0,1,0) after rotation.
    // We'll do a quick approximation:
    const eps = 10;
    const rX = normalize(rot.x);
    const rY = normalize(rot.y);
    // Face normals: front (0,0,1), back (0,0,-1), left (-1,0,0), right (1,0,0), top (0,1,0), bottom (0,-1,0)
    // After rotation by rx about X, then ry about Y:
    // Top face normal (0,1,0) rotated: 
    // R_y(ry) * R_x(rx) * (0,1,0) 
    // = R_y(ry) * (0, cos(rx), sin(rx)) 
    // = (sin(ry)*sin(rx), cos(rx), cos(ry)*sin(rx))
    // We'll compare which face normal gives max dot product with (0,1,0)
    // So we compute for each face normal after rotation and pick max y component.
    // We'll use angles in radians.
    const toRad = deg => deg * Math.PI / 180;
    const rxRad = toRad(rX);
    const ryRad = toRad(rY);
    const sinRx = Math.sin(rxRad);
    const cosRx = Math.cos(rxRad);
    const sinRy = Math.sin(ryRad);
    const cosRy = Math.cos(ryRad);

    // Face normals (before rotation)
    const normals = [
      { id: 1, x: 0, y: 0, z: 1 },   // front
      { id: 6, x: 0, y: 0, z: -1 },  // back
      { id: 3, x: -1, y: 0, z: 0 },  // left
      { id: 4, x: 1, y: 0, z: 0 },   // right
      { id: 2, x: 0, y: 1, z: 0 },   // top
      { id: 5, x: 0, y: -1, z: 0 },  // bottom
    ];

    // Rotate each normal: R_y(ry) * R_x(rx) * normal
    const rotate = (n) => {
      // R_x
      let x1 = n.x;
      let y1 = n.y * cosRx - n.z * sinRx;
      let z1 = n.y * sinRx + n.z * cosRx;
      // R_y
      let x2 = x1 * cosRy + z1 * sinRy;
      let y2 = y1;
      let z2 = -x1 * sinRy + z1 * cosRy;
      return { x: x2, y: y2, z: z2 };
    };

    let bestFace = 1;
    let bestDot = -Infinity;
    normals.forEach((n) => {
      const r = rotate(n);
      // dot with (0,1,0) is r.y
      if (r.y > bestDot) {
        bestDot = r.y;
        bestFace = n.id;
      }
    });
    return bestFace;
  };

  // Update top face after rotation changes
  useEffect(() => {
    const face = getTopFaceValue(rotation);
    setTopFace(face);
  }, [rotation]);

  // Physics: apply momentum
  const startMomentum = (vx, vy) => {
    if (momentumId) cancelAnimationFrame(momentumId);
    let velX = vx;
    let velY = vy;
    const friction = 0.95;
    const minVel = 0.1;

    const step = () => {
      // Update rotation based on velocity
      setRotation(prev => ({
        x: prev.x + velY * 1.5, // swipe up/down rotates around X
        y: prev.y + velX * 1.5, // swipe left/right rotates around Y
        z: prev.z,
      }));
      // Update position based on velocity (with bounds)
      setPosition(prev => {
        let newX = prev.x + velX * 0.5;
        let newY = prev.y + velY * 0.5;
        // Clamp to bounds
        const half = MOVE_BOUNDS;
        newX = Math.max(-half, Math.min(half, newX));
        newY = Math.max(-half, Math.min(half, newY));
        return { x: newX, y: newY };
      });

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

  // Handle drag start
  const handleDragStart = (clientX, clientY) => {
    setIsDragging(true);
    setStartSwipe({ x: clientX, y: clientY });
    // Cancel any ongoing momentum
    if (momentumId) {
      cancelAnimationFrame(momentumId);
      setMomentumId(null);
    }
  };

  const handleDragMove = (clientX, clientY) => {
    if (!isDragging || !startSwipe) return;
    const dx = clientX - startSwipe.x;
    const dy = clientY - startSwipe.y;
    // If movement exceeds threshold, rotate
    const threshold = SWIPE_THRESHOLD;
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      // Determine primary direction
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let dirX = 0, dirY = 0;
      if (absDx > absDy) {
        dirX = Math.sign(dx);
      } else {
        dirY = Math.sign(dy);
      }
      // Apply rotation increment (90 degrees per swipe direction)
      setRotation(prev => ({
        x: prev.x + dirY * 90,
        y: prev.y + dirX * 90,
        z: prev.z,
      }));
      // Move position slightly in that direction
      setPosition(prev => {
        let newX = prev.x + dirX * 8;
        let newY = prev.y + dirY * 8;
        const half = MOVE_BOUNDS;
        newX = Math.max(-half, Math.min(half, newX));
        newY = Math.max(-half, Math.min(half, newY));
        return { x: newX, y: newY };
      });
      // Reset start swipe to allow continuous swipes
      setStartSwipe({ x: clientX, y: clientY });
    }
    // Update velocity for momentum
    setVelocity({ x: dx * 0.2, y: dy * 0.2 });
  };

  const handleDragEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      // Apply momentum if velocity is significant
      const vx = velocity.x;
      const vy = velocity.y;
      if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
        startMomentum(vx, vy);
      }
      setStartSwipe(null);
      setVelocity({ x: 0, y: 0 });
    }
  };

  // Event listeners
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging) return;
      handleDragMove(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      handleDragEnd();
    };
    const onTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
      e.preventDefault();
    };
    const onTouchEnd = () => {
      handleDragEnd();
    };

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
  }, [isDragging, startSwipe, velocity]);

  // Render a face with dots
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
      ref={containerRef}
      className={styles.diceContainer}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onMouseDown={(e) => {
        if (e.button === 0) {
          handleDragStart(e.clientX, e.clientY);
          e.preventDefault();
        }
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        handleDragStart(touch.clientX, touch.clientY);
        e.preventDefault();
      }}
    >
      <div
        ref={diceRef}
        className={styles.dice}
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
        }}
      >
        {FACE_CONFIG.map((face, idx) => {
          // Assign face values: front=1, back=6, left=3, right=4, top=2, bottom=5
          let val;
          switch(face.id) {
            case 'front': val = 1; break;
            case 'back': val = 6; break;
            case 'left': val = 3; break;
            case 'right': val = 4; break;
            case 'top': val = 2; break;
            case 'bottom': val = 5; break;
            default: val = 1;
          }
          return (
            <div
              key={face.id}
              className={`${styles.face} ${styles[face.id]}`}
            >
              <Face value={val} />
            </div>
          );
        })}
      </div>
      {/* Optionally show top face number for debugging */}
      <div className={styles.result}>🎲 {topFace}</div>
    </div>
  );
};

export default Dice3D;
