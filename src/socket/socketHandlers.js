// Authenticated, server-authoritative Socket.IO layer.
//
// Security model:
//  - Identity comes ONLY from the verified JWT+session at handshake; the
//    client can never claim another userId.
//  - Every event re-checks room membership server-side.
//  - Dice and game rules run through shared/ludo.js on the server; the client
//    only sends intent ("roll", "move token #2") and renders broadcast state.
//  - Idle players are auto-played (server-chosen LEGAL move) after a timeout so
//    a disconnect never corrupts or stalls the game.

import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { logger } from '../lib/logger.js';
import { resolveSession } from '../lib/sessions.js';
import {
  setDice,
  moveToken,
  legalTokenIndexes,
  resolveNoMove,
} from '../../shared/ludo.js';
import { ROOM_STATUS, GAME_PHASE } from '../../shared/constants.js';
import {
  gameManager,
  findRoomByCode,
  loadOrCreateState,
  ensureGameRow,
  persistState,
  recordMove,
  completeGame,
  startRoomGame,
} from '../services/ludoService.js';

const TURN_TIMEOUT_MS = 45 * 1000; // idle turn auto-play
const EVENT_RATE = { windowMs: 10_000, max: 40 };

const roomTimers = new Map(); // roomId -> timeout handle

function scheduleTurnTimer(io, roomId) {
  clearTurnTimer(roomId);
  const state = gameManager.get(roomId);
  if (!state || state.winner !== null) return;
  const timer = setTimeout(() => autoAct(io, roomId), TURN_TIMEOUT_MS);
  roomTimers.set(roomId, timer);
}

function clearTurnTimer(roomId) {
  const existing = roomTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    roomTimers.delete(roomId);
  }
}

/** Presence: roomId -> Map(userId -> Set(socketId)). */
const presence = new Map();

function presenceFor(roomId) {
  if (!presence.has(roomId)) presence.set(roomId, new Map());
  return presence.get(roomId);
}

function connectedUserIds(roomId) {
  return [...presenceFor(roomId).keys()];
}

function broadcastRoomState(io, room) {
  const connected = new Set(connectedUserIds(room.id));
  io.to(room.id).emit('room:state', {
    roomId: room.id,
    code: room.code,
    status: room.status,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.user?.username ?? null,
      color: p.color,
      isHost: p.userId === room.hostId,
      connected: connected.has(p.userId),
    })),
  });
}

/** Server decides the next action for a stalled turn (legal moves only). */
async function autoAct(io, roomId) {
  let state = gameManager.get(roomId);
  if (!state || state.winner !== null) return;

  try {
    if (state.phase === GAME_PHASE.SELECT) {
      const legal = legalTokenIndexes(state);
      if (legal.length) {
        const pick = legal[crypto.randomInt(0, legal.length)];
        await applyClientMove(io, roomId, state, pick);
      } else {
        state = resolveNoMove(state);
        gameManager.set(roomId, state);
        io.to(roomId).emit('game:state', state);
        scheduleTurnTimer(io, roomId);
      }
      return;
    }
    // phase === 'roll': auto-roll for the stalled player
    await handleRoll(io, roomId, { auto: true });
  } catch (err) {
    logger.error(`autoAct failed for room ${roomId}`, err.message);
  }
}

/** Shared roll logic for both the 'game:roll' event and auto-play. */
async function handleRoll(io, roomId, { auto = false } = {}) {
  const state0 = gameManager.get(roomId);
  if (!state0 || state0.winner !== null) return { ok: false, error: 'No active game.' };

  let state = state0;
  let guard = 0;
  while (guard++ < 200) {
    state = setDice(state, crypto.randomInt(1, 7));
    const legal = legalTokenIndexes(state);
    if (legal.length > 0) {
      gameManager.set(roomId, state);
      await persistGameState(roomId, state);
      io.to(roomId).emit('game:state', state);
      scheduleTurnTimer(io, roomId);
      return { ok: true, legal, auto };
    }
    // No legal move with this roll.
    if (state.diceValue === 6) {
      // A 6 grants another roll to the SAME player — keep rolling for them.
      state = resolveNoMove(state);
      continue;
    }
    // Non-6 with no legal move: pass the turn and wait for the next player.
    state = resolveNoMove(state);
    break;
  }

  gameManager.set(roomId, state);
  io.to(roomId).emit('game:state', state);
  scheduleTurnTimer(io, roomId);
  return { ok: true, legal: [], auto };
}

async function persistGameState(roomId, state) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { game: { select: { id: true } } } });
  const gameId = room?.game?.id || (await ensureGameRow(roomId));
  await persistState(gameId, state);
}

/** Validate + apply a move coming from a socket or autoAct, then broadcast. */
async function applyClientMove(io, roomId, state, tokenIndex) {
  const result = moveToken(state, tokenIndex);
  if (result.error) return { ok: false, error: result.error };
  const diceUsed = state.diceValue;

  gameManager.set(roomId, result.state);
  await persistGameState(roomId, result.state);
  await recordMove(
    (await ensureGameRow(roomId)),
    result.state.players[state.currentPlayer]?.userId ?? null,
    { by: state.players[state.currentPlayer].userId, tokenIndex, dice: diceUsed, captured: result.captured, winner: result.winner },
  );

  if (result.winner !== null) {
    clearTurnTimer(roomId);
    const winnerPlayer = result.state.players[result.winner];
    const gameId = await ensureGameRow(roomId);
    await completeGame(gameId, result.state, winnerPlayer);
    io.to(roomId).emit('game:state', result.state);
    io.to(roomId).emit('game:ended', {
      winnerIndex: result.winner,
      winner: { userId: winnerPlayer.userId, username: winnerPlayer.username, color: winnerPlayer.color },
    });
    return { ok: true, ended: true, winner: result.winner };
  }

  io.to(roomId).emit('game:state', result.state);
  scheduleTurnTimer(io, roomId);
  return { ok: true, ended: false };
}

export default function attachSocketHandlers(io) {
  // ── Handshake authentication ────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const session = await resolveSession(prisma, token);
      if (!session) return next(new Error('unauthorized'));
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, username: true },
      });
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user; // server-derived identity — never client-provided
      socket.data.sessionId = session.id;
      next();
    } catch (err) {
      logger.error('Socket auth failure', err.message);
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected ${socket.id} (user ${socket.data.user.username})`);

    // Per-socket event rate guard
    const events = [];
    const rateOk = () => {
      const now = Date.now();
      while (events.length && events[0] <= now - EVENT_RATE.windowMs) events.shift();
      if (events.length >= EVENT_RATE.max) return false;
      events.push(now);
      return true;
    };

    const sendError = (ack, message, code = 'ERROR') => {
      if (typeof ack === 'function') ack({ ok: false, error: message, code });
      else socket.emit('room:error', { message, code });
    };

    // ── Join a room by its join code ───────────────────────────────────────
    socket.on('room:join', async ({ code } = {}, ack) => {
      try {
        if (!rateOk()) return sendError(ack, 'Too many events. Slow down.', 'RATE_LIMITED');
        const room = await findRoomByCode(String(code || '').trim());
        if (!room) return sendError(ack, 'Room not found.', 'NOT_FOUND');
        const isMember = room.players.some((p) => p.userId === socket.data.user.id);
        if (!isMember) return sendError(ack, 'Join the room from the lobby first.', 'NOT_MEMBER');

        socket.join(room.id);
        socket.data.roomId = room.id;
        socket.data.roomCode = room.code;

        const conn = presenceFor(room.id);
        if (!conn.has(socket.data.user.id)) conn.set(socket.data.user.id, new Set());
        conn.get(socket.data.user.id).add(socket.id);

        const state = await loadOrCreateState(room);
        // mark this user connected in the authoritative state
        const seat = state.players.find((p) => p.userId === socket.data.user.id);
        if (seat) seat.connected = true;
        gameManager.set(room.id, state);

        broadcastRoomState(io, room);

        // Auto-start once every seat is filled while still waiting.
        if (room.status === ROOM_STATUS.WAITING && room.players.length >= room.maxPlayers) {
          const started = await startRoomGame(room);
          io.to(room.id).emit('game:started', { state: started.state, gameId: started.gameId });
          scheduleTurnTimer(io, room.id);
        } else if (room.status === ROOM_STATUS.PLAYING && state.players.length > 1) {
          io.to(room.id).emit('game:started', { state, gameId: room.game?.id });
          scheduleTurnTimer(io, room.id);
        }

        if (typeof ack === 'function') {
          ack({ ok: true, roomId: room.id, code: room.code, status: room.status, state: gameManager.get(room.id) });
        }
        socket.to(room.id).emit('room:notice', { kind: 'joined', username: socket.data.user.username });
      } catch (err) {
        logger.error('room:join failed', err.message);
        sendError(ack, 'Unable to join the room right now.', 'SERVER_ERROR');
      }
    });

    // ── Roll dice (server decides the value) ───────────────────────────────
    socket.on('game:roll', async (ack) => {
      try {
        if (!rateOk()) return sendError(ack, 'Too many events. Slow down.', 'RATE_LIMITED');
        const roomId = socket.data.roomId;
        const state = gameManager.get(roomId);
        if (!state) return sendError(ack, 'Join a room first.', 'NOT_IN_ROOM');
        const me = state.players.find((p) => p.userId === socket.data.user.id);
        if (!me) return sendError(ack, 'You are not a player in this game.', 'NOT_MEMBER');
        if (state.players[state.currentPlayer].userId !== socket.data.user.id) {
          return sendError(ack, 'It is not your turn.', 'NOT_YOUR_TURN');
        }
        const res = await handleRoll(io, roomId);
        if (!res.ok) return sendError(ack, res.error);
        if (typeof ack === 'function') ack({ ok: true, legal: res.legal, auto: res.auto });
      } catch (err) {
        logger.error('game:roll failed', err.message);
        sendError(ack, 'Unable to roll right now.', 'SERVER_ERROR');
      }
    });

    // ── Move a token (validated by the engine) ─────────────────────────────
    socket.on('game:move', async ({ tokenIndex } = {}, ack) => {
      try {
        if (!rateOk()) return sendError(ack, 'Too many events. Slow down.', 'RATE_LIMITED');
        const roomId = socket.data.roomId;
        const state = gameManager.get(roomId);
        if (!state) return sendError(ack, 'Join a room first.', 'NOT_IN_ROOM');
        if (state.players[state.currentPlayer].userId !== socket.data.user.id) {
          return sendError(ack, 'It is not your turn.', 'NOT_YOUR_TURN');
        }
        if (state.phase !== GAME_PHASE.SELECT) {
          return sendError(ack, 'Roll the dice first.', 'WRONG_PHASE');
        }
        if (!Number.isInteger(tokenIndex) || tokenIndex < 0 || tokenIndex > 3) {
          return sendError(ack, 'Invalid token.', 'VALIDATION');
        }
        const legal = legalTokenIndexes(state);
        if (!legal.includes(tokenIndex)) {
          return sendError(ack, 'That token cannot move with this roll.', 'ILLEGAL_MOVE');
        }
        const res = await applyClientMove(io, roomId, state, tokenIndex);
        if (!res.ok) return sendError(ack, res.error);
        if (typeof ack === 'function') ack({ ok: true, ended: res.ended, winner: res.winner ?? null });
      } catch (err) {
        logger.error('game:move failed', err.message);
        sendError(ack, 'Unable to move right now.', 'SERVER_ERROR');
      }
    });

    // ── Leave room (socket level) ──────────────────────────────────────────
    socket.on('room:leave', async (ack) => {
      const roomId = socket.data.roomId;
      if (roomId) socket.leave(roomId);
      socket.data.roomId = null;
      socket.data.roomCode = null;
      if (typeof ack === 'function') ack({ ok: true });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const userId = socket.data.user?.id;
      const roomId = socket.data.roomId;
      logger.info(`Socket disconnected ${socket.id} (user ${socket.data.user?.username ?? '?'})`);
      if (!roomId || !userId) return;

      const conn = presence.get(roomId);
      const userSockets = conn?.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) conn.delete(userId);
      }
      if (conn && conn.size === 0) presence.delete(roomId);

      const state = gameManager.get(roomId);
      if (state) {
        const seat = state.players.find((p) => p.userId === userId);
        if (seat && !conn?.has(userId)) {
          seat.connected = false; // temporary disconnect never corrupts state
          gameManager.set(roomId, state);
          io.to(roomId).emit('game:state', state);
          scheduleTurnTimer(io, roomId); // their turn auto-plays if they don't return
        }
      }
      const room = await findRoomByCode(socket.data.roomCode);
      if (room) broadcastRoomState(io, room);
      socket.to(roomId).emit('room:notice', { kind: 'left', username: socket.data.user?.username ?? 'someone' });
    });
  });
}
