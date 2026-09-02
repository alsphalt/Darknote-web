'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { socketUrl } from '@/lib/config';
import { getToken } from '@/lib/api';
import { log } from '@/lib/log';
import { legalTokenIndexes } from '@/shared/ludo';
import { GAME_PHASE } from '@/shared/constants';
import { useAuth } from '@/contexts/AuthContext';

const SocketContext = createContext(null);

/**
 * One Socket.IO connection per mounted provider (one room at a time).
 * - Authenticated handshake (JWT); identity is server-derived.
 * - Auto-reconnects and re-joins the room, receiving the authoritative state.
 * - Every listener is registered exactly once; cleanup on unmount.
 */
export function SocketProvider({ children, code }) {
  const { user } = useAuth();
  const [gameState, setGameState] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [connection, setConnection] = useState('idle'); // idle|connecting|connected|reconnecting|disconnected|error
  const [lastError, setLastError] = useState(null);
  const [ended, setEnded] = useState(null); // {winnerIndex, winner}

  const socketRef = useRef(null);
  const roomCodeRef = useRef(null); // non-null => join (or rejoin) this room
  const pendingJoinRef = useRef(null); // queued join while socket still connecting

  // ── join / leave (called by RoomScreen) ──────────────────────────────────
  const joinRoom = useCallback((joinCode) => {
    return new Promise((resolve, reject) => {
      const sock = socketRef.current;
      if (!sock) {
        reject(new Error('Socket is not ready yet. Please retry.'));
        return;
      }
      roomCodeRef.current = String(joinCode).trim();

      const doJoin = () => {
        sock.emit('room:join', { code: roomCodeRef.current }, (res) => {
          if (res && res.ok) {
            if (res.state) setGameState(res.state);
            setLastError(null);
            resolve(res);
          } else {
            const message = res?.error || 'Unable to join the room.';
            setLastError(message);
            reject(new Error(message));
          }
        });
      };

      if (sock.connected) doJoin();
      else pendingJoinRef.current = doJoin; // connect handler will run it
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const sock = socketRef.current;
    roomCodeRef.current = null;
    pendingJoinRef.current = null;
    if (sock?.connected) sock.emit('room:leave', () => {});
    setGameState(null);
    setRoomState(null);
    setEnded(null);
  }, []);

  // ── actions (all validated server-side) ──────────────────────────────────
  const roll = useCallback(() => {
    return new Promise((resolve, reject) => {
      const sock = socketRef.current;
      if (!sock || !sock.connected) {
        reject(new Error('Connection lost. Reconnecting… please wait.'));
        return;
      }
      sock.emit('game:roll', (res) => {
        if (res && res.ok) resolve(res);
        else reject(new Error(res?.error || 'Unable to roll right now.'));
      });
    });
  }, []);

  const move = useCallback((tokenIndex) => {
    return new Promise((resolve, reject) => {
      const sock = socketRef.current;
      if (!sock || !sock.connected) {
        reject(new Error('Connection lost. Reconnecting… please wait.'));
        return;
      }
      sock.emit('game:move', { tokenIndex }, (res) => {
        if (res && res.ok) resolve(res);
        else reject(new Error(res?.error || 'That move was rejected.'));
      });
    });
  }, []);

  // ── socket lifecycle (once per mount) ────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setConnection('error');
      setLastError('You must be logged in to play.');
      return undefined;
    }

    const sock = io(socketUrl(), {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });
    socketRef.current = sock;

    sock.on('connect', () => {
      log.debug('socket connected');
      setConnection('connected');
      if (pendingJoinRef.current && roomCodeRef.current) {
        const fn = pendingJoinRef.current;
        pendingJoinRef.current = null;
        fn();
      } else if (roomCodeRef.current) {
        // reconnection: silently re-join to receive authoritative state
        sock.emit('room:join', { code: roomCodeRef.current }, (res) => {
          if (res?.ok && res.state) setGameState(res.state);
        });
      }
    });

    sock.on('disconnect', (reason) => {
      log.debug('socket disconnected', reason);
      setConnection(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
    });

    sock.on('connect_error', (err) => {
      log.warn('socket connect_error', err.message);
      setLastError(err.message === 'unauthorized'
        ? 'Your session expired. Please log in again.'
        : 'Unable to connect to the server. Retrying…');
      setConnection('reconnecting');
    });

    sock.on('room:state', (rs) => setRoomState(rs));
    sock.on('game:started', ({ state }) => {
      setGameState(state);
      setEnded(null);
    });
    sock.on('game:state', (state) => setGameState(state));
    sock.on('game:ended', (info) => setEnded(info));
    sock.on('room:closed', () => {
      setLastError('The room was closed.');
      leaveRoom();
    });
    sock.on('room:error', ({ message }) => setLastError(message || 'Room error.'));

    return () => {
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── derived UI state (read-only; server re-validates every action) ───────
  const mySeat = useMemo(() => {
    if (!gameState || !user) return null;
    const index = gameState.players.findIndex((p) => p.userId === user.id);
    if (index === -1) return null;
    return { index, ...gameState.players[index] };
  }, [gameState, user]);

  const isMyTurn = Boolean(
    mySeat && gameState && gameState.winner === null
    && gameState.players[gameState.currentPlayer]?.userId === user?.id,
  );

  const legalMoves = useMemo(() => {
    if (!isMyTurn || !gameState || gameState.phase !== GAME_PHASE.SELECT) return [];
    return legalTokenIndexes(gameState); // display hint only — server enforces
  }, [isMyTurn, gameState]);

  const value = useMemo(() => ({
    gameState,
    roomState,
    connection,
    lastError,
    ended,
    mySeat,
    isMyTurn,
    legalMoves,
    joinRoom,
    leaveRoom,
    roll,
    move,
    setLastError,
    isConnected: connection === 'connected',
  }), [gameState, roomState, connection, lastError, ended, mySeat, isMyTurn, legalMoves,
    joinRoom, leaveRoom, roll, move]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}
