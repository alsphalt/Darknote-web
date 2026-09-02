import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import { validateRoomCode, ROOM_MODE } from '../../shared/validation.js';
import { COLORS, ROOM_STATUS } from '../../shared/constants.js';
import { ROOM_WITH_PLAYERS, findRoomByCode, startRoomGame } from '../services/ludoService.js';

/**
 * Room routes. Built as a factory because starting a game needs the Socket.IO
 * instance to broadcast the authoritative state to the room.
 */
export default function buildRoomRoutes(io) {
  const router = Router();

  /** True 6-digit numeric code using a CSPRNG. */
  function randomDigits(length) {
    let out = '';
    for (let i = 0; i < length; i += 1) out += String(crypto.randomInt(0, 10));
    return out;
  }

  /** Generate a code that is not already in use (bounded retries). */
  async function freshCode() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const code = randomDigits(6);
      const existing = await prisma.room.findUnique({ where: { code }, select: { id: true } });
      if (!existing) return code;
    }
    const err = new Error('Could not allocate a room code. Please try again.');
    err.status = 500;
    throw err;
  }

  function roomDto(room) {
    return {
      id: room.id,
      code: room.code,
      mode: room.mode,
      status: room.status,
      maxPlayers: room.maxPlayers,
      host: room.host ? { id: room.host.id, username: room.host.username } : null,
      players: room.players.map((p) => ({
        userId: p.userId,
        username: p.user?.username ?? null,
        color: p.color,
        joinedAt: p.joinedAt,
      })),
      game: room.game
        ? { id: room.game.id, winnerId: room.game.winnerId, finishedAt: room.game.finishedAt }
        : null,
    };
  }

  // ── Create room ──────────────────────────────────────────────────────────
  router.post('/', authenticate, async (req, res, next) => {
    try {
      const mode = req.body?.mode === ROOM_MODE.BET ? ROOM_MODE.BET : ROOM_MODE.NORMAL;
      if (mode === ROOM_MODE.BET) {
        // No payment backend exists in this codebase -> refuse instead of faking.
        return res.status(400).json({
          error: 'Bet rooms require a payment provider (M-PESA) that is not configured.',
          code: 'BET_UNAVAILABLE',
        });
      }
      const maxPlayers = Number(req.body?.maxPlayers);
      if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
        return res.status(400).json({ error: 'Player count must be 2, 3 or 4.', code: 'VALIDATION' });
      }

      const code = await freshCode();
      const room = await prisma.room.create({
        data: {
          code,
          mode: ROOM_MODE.NORMAL,
          maxPlayers,
          hostId: req.user.id,
          players: { create: { userId: req.user.id, color: COLORS[0] } },
        },
        ...ROOM_WITH_PLAYERS,
      });
      logger.info(`Room ${code} created by ${req.user.username} (max ${maxPlayers})`);
      res.status(201).json(roomDto(room));
    } catch (err) {
      next(err);
    }
  });

  // ── Join by code ─────────────────────────────────────────────────────────
  router.post('/join', authenticate, async (req, res, next) => {
    try {
      const checked = validateRoomCode(req.body?.code);
      if (!checked.valid) return res.status(400).json({ error: checked.error, code: 'VALIDATION' });

      const room = await findRoomByCode(checked.normalized);
      if (!room) return res.status(404).json({ error: 'Room not found. Check the code and try again.', code: 'NOT_FOUND' });
      if (room.status !== ROOM_STATUS.WAITING) {
        return res.status(400).json({ error: 'That game has already started.', code: 'GAME_STARTED' });
      }
      if (room.players.some((p) => p.userId === req.user.id)) {
        return res.status(409).json({ error: 'You are already in this room.', code: 'ALREADY_MEMBER' });
      }
      if (room.players.length >= room.maxPlayers) {
        return res.status(400).json({ error: 'Room is full.', code: 'ROOM_FULL' });
      }

      const used = new Set(room.players.map((p) => p.color).filter(Boolean));
      const color = COLORS.find((c) => !used.has(c));
      if (!color) return res.status(400).json({ error: 'Room is full.', code: 'ROOM_FULL' });

      await prisma.roomUser.create({ data: { userId: req.user.id, roomId: room.id, color } });
      const updated = await findRoomByCode(checked.normalized);
      logger.info(`User ${req.user.username} joined room ${room.code} as ${color}`);
      io.to(room.id).emit('room:update', roomDto(updated));
      res.json(roomDto(updated));
    } catch (err) {
      next(err);
    }
  });

  // ── Get room by code ─────────────────────────────────────────────────────
  router.get('/:code', authenticate, async (req, res, next) => {
    try {
      const checked = validateRoomCode(req.params.code);
      if (!checked.valid) return res.status(400).json({ error: checked.error, code: 'VALIDATION' });
      const room = await findRoomByCode(checked.normalized);
      if (!room) return res.status(404).json({ error: 'Room not found.', code: 'NOT_FOUND' });
      res.json(roomDto(room));
    } catch (err) {
      next(err);
    }
  });

  // ── Host starts the game (>=2 players) ───────────────────────────────────
  router.post('/:code/start', authenticate, async (req, res, next) => {
    try {
      const checked = validateRoomCode(req.params.code);
      if (!checked.valid) return res.status(400).json({ error: checked.error, code: 'VALIDATION' });
      const room = await findRoomByCode(checked.normalized);
      if (!room) return res.status(404).json({ error: 'Room not found.', code: 'NOT_FOUND' });
      if (room.hostId !== req.user.id) {
        return res.status(403).json({ error: 'Only the room host can start the game.', code: 'FORBIDDEN' });
      }
      const { state, started, gameId } = await startRoomGame(room);
      // Tell the room; members open the game via their socket.
      io.to(room.id).emit('game:started', { roomId: room.id, gameId, state });
      res.json({ ok: started, state });
    } catch (err) {
      next(err);
    }
  });

  // ── Leave (allowed while the room is still waiting) ──────────────────────
  router.post('/:code/leave', authenticate, async (req, res, next) => {
    try {
      const checked = validateRoomCode(req.params.code);
      if (!checked.valid) return res.status(400).json({ error: checked.error, code: 'VALIDATION' });
      const room = await findRoomByCode(checked.normalized);
      if (!room) return res.status(404).json({ error: 'Room not found.', code: 'NOT_FOUND' });
      if (!room.players.some((p) => p.userId === req.user.id)) {
        return res.status(409).json({ error: 'You are not in this room.', code: 'NOT_MEMBER' });
      }
      if (room.status !== ROOM_STATUS.WAITING) {
        return res.status(400).json({ error: 'You cannot leave while a game is in progress.', code: 'GAME_STARTED' });
      }

      await prisma.roomUser.delete({ where: { userId_roomId: { userId: req.user.id, roomId: room.id } } });
      let updated;
      if (room.hostId === req.user.id) {
        const remaining = room.players.filter((p) => p.userId !== req.user.id);
        if (remaining.length === 0) {
          await prisma.room.delete({ where: { id: room.id } });
          io.to(room.id).emit('room:closed', { roomId: room.id });
          return res.json({ ok: true, closed: true });
        }
        updated = await prisma.room.update({
          where: { id: room.id },
          data: { hostId: remaining[0].userId },
          ...ROOM_WITH_PLAYERS,
        });
      } else {
        updated = await findRoomByCode(checked.normalized);
      }
      io.to(room.id).emit('room:update', roomDto(updated));
      res.json({ ok: true, room: roomDto(updated) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
