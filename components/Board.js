'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './Board.module.css';
import { useSocket } from '@/contexts/SocketContext';
import {
  tokenPoint, ringSlot, homeSlot, laneSlot, doneSlot, baseSquare,
  LOOP, CENTRE, VIEW,
} from '@/shared/layout';
import { COLORS, GAME_PHASE } from '@/shared/constants';

const COLOR_HEX = {
  red: '#e74c3c',
  green: '#2ecc71',
  yellow: '#f1c40f',
  blue: '#3498db',
};
const COLOR_DARK = { red: '#a93226', green: '#1e8449', yellow: '#b7950b', blue: '#21618c' };

function DiceFace({ value }) {
  const dots = {
    1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  }[value] || [];
  return (
    <div className={`${styles.diceFace} ${value ? styles.shake : ''}`}>
      {Array.from({ length: 3 }).map((_, r) => (
        <div key={r} className={styles.diceRow}>
          {Array.from({ length: 3 }).map((_, c) => {
            const on = dots.some(([dr, dc]) => dr === r && dc === c);
            return <span key={c} className={`${styles.diceDot} ${on ? styles.diceDotOn : ''}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

export default function Board() {
  const {
    gameState, connection, lastError, isMyTurn, legalMoves, roll, move,
    ended, mySeat, isConnected, setLastError,
  } = useSocket();
  const [actionError, setActionError] = useState(null);
  const [rolling, setRolling] = useState(false);

  const players = gameState?.players || [];
  const current = gameState && gameState.winner === null ? players[gameState.currentPlayer] : null;
  const myColor = mySeat?.color ?? null;
  const winnerIdx = gameState?.winner ?? (ended ? players.findIndex((p) => p.userId === ended.winner?.userId) : null);
  const winner = winnerIdx !== null && winnerIdx !== -1 ? players[winnerIdx] : null;

  // clear transient errors when a new authoritative state arrives
  useEffect(() => {
    setActionError(null);
    setLastError(null);
  }, [gameState, setLastError]);

  const tryRoll = async () => {
    if (!isMyTurn || rolling) return;
    setRolling(true);
    setActionError(null);
    try {
      await roll();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setRolling(false);
    }
  };

  const tryMove = async (tokenIndex) => {
    setActionError(null);
    try {
      await move(tokenIndex);
    } catch (err) {
      setActionError(err.message);
    }
  };

  // ── token render list with stacking offsets for shared cells ────────────
  const tokens = useMemo(() => {
    const list = [];
    for (const p of players) {
      for (let t = 0; t < p.progress.length; t += 1) {
        const point = tokenPoint(p.color, p.progress[t]);
        let coord = null;
        if (point.kind === 'home') {
          const s = homeSlot(p.color, t);
          coord = [s.x, s.y];
        } else {
          coord = [point.x, point.y];
        }
        list.push({ color: p.color, username: p.username, tokenIndex: t, progress: p.progress[t], kind: point.kind, x: coord[0], y: coord[1] });
      }
    }
    // offset duplicates (same cell)
    const groups = {};
    for (const tk of list) {
      const k = `${tk.x},${tk.y}`;
      (groups[k] = groups[k] || []).push(tk);
    }
    for (const k of Object.keys(groups)) {
      const g = groups[k];
      if (g.length > 1) {
        const off = 7;
        g.forEach((tk, i) => {
          const dx = (i - (g.length - 1) / 2) * off;
          const dy = (i % 2 === 0 ? -1 : 1) * off * 0.4;
          tk.x += dx;
          tk.y += dy;
        });
      }
    }
    return list;
  }, [players]);

  const legalSet = useMemo(() => new Set(legalMoves), [legalMoves]);

  const showTokens = Boolean(gameState && players.length >= 2);

  return (
    <div className={`${styles.boardShell}`}>
      <svg viewBox={`0 0 ${VIEW.size} ${VIEW.size}`} className={styles.boardSvg} role="img" aria-label="Ludo board">
        {/* backdrop + centre */}
        <rect x={0} y={0} width={VIEW.size} height={VIEW.size} rx={28} fill="#14142b" />
        <rect x={CENTRE.x0 - 10} y={CENTRE.y0 - 10} width={CENTRE.x1 - CENTRE.x0 + 20} height={CENTRE.y1 - CENTRE.y0 + 20} rx={16} fill="#fff8ef" />

        {/* ring track band */}
        <rect x={LOOP.x0 - 16} y={LOOP.y0 - 16} width={LOOP.x1 - LOOP.x0 + 32} height={LOOP.y1 - LOOP.y0 + 32} rx={20} fill="#fdf5e6" opacity={0.92} />
        <rect x={LOOP.x0 - 9} y={LOOP.y0 - 9} width={LOOP.x1 - LOOP.x0 + 18} height={LOOP.y1 - LOOP.y0 + 18} rx={20} fill="#1a1a2e" />

        {/* bases + slots */}
        {COLORS.map((color) => {
          const b = baseSquare(color);
          const on = players.some((p) => p.color === color);
          return (
            <g key={color} opacity={on ? 1 : 0.45}>
              <rect x={b.x + 6} y={b.y + 6} width={b.size - 12} height={b.size - 12} rx={14}
                fill={COLOR_HEX[color]} stroke="#fff" strokeWidth={1.5} opacity={0.92} />
              {[0, 1, 2, 3].map((i) => {
                const s = homeSlot(color, i);
                return <circle key={i} cx={s.x} cy={s.y} r={10} fill="#ffffff55" stroke="#ffffff99" strokeWidth={1} />;
              })}
            </g>
          );
        })}

        {/* lane guides + ring slot markers */}
        {players.map((p) => (
          <g key={`lane-${p.color}`}>
            {[0, 1, 2, 3].map((t) => {
              const pt = tokenPoint(p.color, 53 + t);
              if (pt.kind !== 'lane') return null;
              return <circle key={t} cx={pt.x} cy={pt.y} r={9} fill={COLOR_HEX[p.color]} opacity={0.25} />;
            })}
          </g>
        ))}
        {Array.from({ length: 52 }).map((_, w) => {
          const s = ringSlot(w);
          return <circle key={w} cx={s.x} cy={s.y} r={3.5} fill="#8899bb" opacity={0.35} />;
        })}
        {COLORS.map((c) => {
          const d = doneSlot(c);
          return <circle key={`done-${c}`} cx={d.x} cy={d.y} r={13} fill={COLOR_HEX[c]} opacity={0.85} />;
        })}

        {/* tokens */}
        {showTokens && tokens.map((tk, i) => {
          const legal = tk.color === myColor && legalSet.has(tk.tokenIndex);
          const dim = current && tk.color !== current.color && tk.kind !== 'done';
          return (
            <g key={`${tk.color}-${tk.tokenIndex}-${i}`}
              onClick={legal ? () => tryMove(tk.tokenIndex) : undefined}
              className={legal ? styles.clickable : undefined}>
              {legal && <circle cx={tk.x} cy={tk.y} r={15} fill="none" stroke="#fff" strokeWidth={2} className={styles.pulse} />}
              <circle cx={tk.x} cy={tk.y} r={11} fill={COLOR_HEX[tk.color]}
                stroke={legal ? '#fff' : '#ffffffcc'} strokeWidth={legal ? 2 : 1.2}
                opacity={dim ? 0.55 : 1} />
              <circle cx={tk.x - 3} cy={tk.y - 3.5} r={2.6} fill="#ffffffbb" />
            </g>
          );
        })}

        {winner && (
          <g>
            <rect x={170} y={258} width={260} height={84} rx={16} fill="#14142b" opacity={0.92} stroke={COLOR_HEX[winner.color]} strokeWidth={2} />
            <text x={300} y={296} textAnchor="middle" fill="#ffd700" fontSize={22} fontWeight="bold">
              🏆 {winner.username || winner.color} wins!
            </text>
            <text x={300} y={322} textAnchor="middle" fill="#ccd" fontSize={14}>
              Game complete — back to the lobby to play again.
            </text>
          </g>
        )}
      </svg>

      {/* side controls */}
      <div className={styles.sidePanel}>
        <DiceFace value={gameState?.diceValue || null} />
        <button className={styles.rollBtn} disabled={!isMyTurn || rolling || gameState?.phase !== GAME_PHASE.ROLL || !isConnected}
          onClick={tryRoll}>
          {!isConnected ? 'Connecting…' : rolling ? 'Rolling…' : isMyTurn ? 'Roll dice' : 'Wait for turn'}
        </button>

        <div className={styles.statusBox}>
          {current ? (
            <>
              <span className={styles.statusDot} style={{ background: COLOR_HEX[current.color] }} />
              {current.userId === mySeat?.userId ? 'Your turn' : `${current.username || current.color} is rolling`}
            </>
          ) : (
            <span>Waiting for the game to start…</span>
          )}
          <div style={{ fontSize: 12, color: '#8899bb' }}>
            {connection === 'connected' ? '● live' : connection === 'reconnecting' ? '○ reconnecting…' : '○ offline'}
          </div>
        </div>

        {actionError && <div className={styles.errorBox}>{actionError}</div>}
        {lastError && !actionError && <div className={styles.errorBox}>{lastError}</div>}
      </div>
    </div>
  );
}
