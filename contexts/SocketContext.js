'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export function SocketProvider({ children, roomId, userId, token }) {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    if (!roomId || !userId) return;
    const socketInstance = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000');
    socketInstance.on('connect', () => {
      socketInstance.emit('join-room', { roomId, userId, token });
    });
    socketInstance.on('game-state', (state) => {
      setGameState(state);
    });
    setSocket(socketInstance);
    return () => socketInstance.disconnect();
  }, [roomId, userId]);

  const emit = (event, data) => socket?.emit(event, data);

  return (
    <SocketContext.Provider value={{ socket, gameState, emit }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
