'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export function SocketProvider({ children, roomId, userId, token }) {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!roomId || !userId) return;

    // Use environment variable for backend URL (default: localhost:5000)
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

    const socketInstance = io(BACKEND_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      // Join the room after connection
      socketInstance.emit('join-room', { roomId, userId, token });
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('game-state', (state) => {
      setGameState(state);
    });

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      socketInstance.disconnect();
    };
  }, [roomId, userId, token]);

  // Emit function – safe to call from components
  const emit = (event, data) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  };

  return (
    <SocketContext.Provider value={{ socket, gameState, emit, userId, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

// Custom hook for consuming the context
export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
