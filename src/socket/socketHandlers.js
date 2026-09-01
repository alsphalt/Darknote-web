import { Server } from 'socket.io';

// In-memory game states (roomId -> full game state)
const gameStates = new Map();

// Shared game logic (copy from frontend hooks)
// We'll define a simplified version of the Ludo rules (move, capture, win)
// This should be identical to the frontend's `useLudoGame` logic.
// We'll export a function `applyMove(state, playerColor, tokenIndex, diceValue)` that returns new state.

export default function socketHandler(io, prisma) {
  io.on('connection', (socket) => {
    console.log('🟢 New client connected:', socket.id);

    // ---- Join room ----
    socket.on('join-room', async ({ roomId, userId, token }) => {
      // Verify token and user belongs to room
      // For simplicity, we'll assume the frontend sends a valid user ID.
      // We'll store socket.roomId and socket.userId.
      socket.roomId = roomId;
      socket.userId = userId;
      socket.join(roomId);

      // Load existing game state (if any)
      if (!gameStates.has(roomId)) {
        // Create initial state from database (or create new)
        // For now, initialize a new game with 4 players.
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: { players: { include: { user: true } } },
        });
        if (room) {
          const players = room.players.map((p, idx) => ({
            color: p.color || ['red','green','yellow','blue'][idx],
            userId: p.userId,
            tokens: Array(4).fill().map(() => ({ position: 'home' })),
            finished: 0,
          }));
          const state = {
            players,
            currentPlayerIndex: 0,
            diceValue: null,
            phase: 'roll',
            winner: null,
          };
          gameStates.set(roomId, state);
          // Save initial state to DB (optional)
        }
      }

      // Send current state to the joining client
      const state = gameStates.get(roomId);
      if (state) {
        socket.emit('game-state', state);
      }

      // Notify others in room
      socket.to(roomId).emit('player-joined', { userId });
    });

    // ---- Roll dice ----
    socket.on('roll-dice', async ({ roomId }) => {
      const state = gameStates.get(roomId);
      if (!state) return;
      // Check if it's this player's turn
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (currentPlayer.userId !== socket.userId) return;
      if (state.phase !== 'roll') return;

      // Generate random dice value (1-6)
      const value = Math.floor(Math.random() * 6) + 1;
      state.diceValue = value;
      state.phase = 'select';
      state.canRoll = false;

      // Broadcast new state to all in room
      io.to(roomId).emit('game-state', state);
    });

    // ---- Move token ----
    socket.on('move-token', async ({ roomId, tokenIndex }) => {
      const state = gameStates.get(roomId);
      if (!state) return;
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (currentPlayer.userId !== socket.userId) return;
      if (state.phase !== 'select') return;

      // Apply move using shared logic (we'll need to import)
      const newState = applyMove(state, currentPlayer.color, tokenIndex, state.diceValue);
      if (newState) {
        gameStates.set(roomId, newState);
        // Save move to database (async)
        await saveMove(roomId, currentPlayer.userId, { tokenIndex, diceValue: state.diceValue, newState });
        // Check win
        if (newState.winner !== null) {
          // End game, save to DB
        }
        io.to(roomId).emit('game-state', newState);
      }
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      console.log('🔴 Client disconnected:', socket.id);
      // Could handle reconnection logic here
    });
  });
}
