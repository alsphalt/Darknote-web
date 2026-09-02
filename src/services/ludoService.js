// Single source of truth for starting/persisting authoritative Ludo games.
// Used by BOTH the REST routes and the Socket.IO handlers so that the
// in-memory authoritative state and the database never diverge.

import { prisma } from '../prisma.js';
import { createGame } from '../../shared/ludo.js';
import { COLORS, ROOM_STATUS } from '../../shared/constants.js';
import { logger } from '../lib/logger.js';

// In-memory authoritative states: roomId -> engine state.
// Single-process design (see FINAL_REPORT: scale-out needs a shared store).
const games = new Map();

export const gameManager = {
  get: (roomId) => games.get(roomId) ?? null,
  set: (roomId, state) => games.set(roomId, state),
  has: (roomId) => games.has(roomId),
  delete: (roomId) => games.delete(roomId),
};

export const ROOM_WITH_PLAYERS = {
  include: {
    host: { select: { id: true, username: true } },
    players: {
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, username: true } } },
    },
    game: { select: { id: true, state: true, winnerId: true, finishedAt: true } },
  },
};

export async function findRoomByCode(code) {
  return prisma.room.findUnique({ where: { code }, ...ROOM_WITH_PLAYERS });
}

export async function findRoomById(id) {
  return prisma.room.findUnique({ where: { id }, ...ROOM_WITH_PLAYERS });
}

/**
 * Build the authoritative engine state for a room.
 * Priority: live in-memory state > persisted Game.state > fresh from players.
 */
export async function loadOrCreateState(room) {
  if (games.has(room.id)) return games.get(room.id);

  if (room.game?.state) {
    try {
      const saved = JSON.parse(room.game.state);
      if (saved?.players?.length) {
        games.set(room.id, saved);
        return saved;
      }
    } catch {
      logger.warn(`Ignoring corrupt persisted game state for room ${room.id}`);
    }
  }

  const state = createGame({
    roomId: room.id,
    players: room.players.map((ru, idx) => ({
      userId: ru.userId,
      username: ru.user?.username ?? null,
      color: ru.color || COLORS[idx] || COLORS[room.players.length % COLORS.length],
    })),
  });
  games.set(room.id, state);
  return state;
}

/** Upsert the Game row carrying the authoritative state. */
export async function ensureGameRow(roomId) {
  const existing = await prisma.game.findUnique({ where: { roomId }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.game.create({
    data: { roomId, state: {} },
    select: { id: true },
  });
  return created.id;
}

export async function persistState(gameId, state) {
  await prisma.game.update({
    where: { id: gameId },
    data: { state: JSON.parse(JSON.stringify(state)) },
  });
}

export async function recordMove(gameId, userId, data) {
  await prisma.move.create({
    data: { gameId, playerId: userId, data },
  });
}

export async function completeGame(gameId, state, winnerPlayer) {
  await prisma.game.update({
    where: { id: gameId },
    data: {
      state: JSON.parse(JSON.stringify(state)),
      winnerId: winnerPlayer?.userId ?? null,
      finishedAt: new Date(),
    },
  });
  await prisma.room.update({
    where: { id: state.roomId },
    data: { status: ROOM_STATUS.FINISHED },
  });
  logger.info(`Game ${gameId} finished; winner ${winnerPlayer?.userId ?? 'none'}`);
}

/**
 * Start the room's game (idempotent). Transitions waiting -> playing,
 * creates the Game row and broadcasts the authoritative state.
 * @returns {{state:object, started:boolean, gameId:string}}
 */
export async function startRoomGame(room) {
  if (room.status === ROOM_STATUS.PLAYING || room.status === ROOM_STATUS.FINISHED) {
    const state = await loadOrCreateState(room);
    return { state, started: false, gameId: room.game?.id };
  }
  if (!room.players || room.players.length < 2) {
    const err = new Error('At least 2 players are needed to start.');
    err.status = 400;
    err.code = 'NOT_ENOUGH_PLAYERS';
    throw err;
  }
  const state = await loadOrCreateState(room);
  const gameId = await ensureGameRow(room.id);
  await persistState(gameId, state);
  await prisma.room.update({ where: { id: room.id }, data: { status: ROOM_STATUS.PLAYING } });
  logger.info(`Room ${room.code} started with ${state.players.length} players`);
  return { state, started: true, gameId };
}
