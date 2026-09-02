import { Router } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── Own game history ────────────────────────────────────────────────────────
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const games = await prisma.game.findMany({
      where: { room: { players: { some: { userId: req.user.id } } } },
      include: {
        room: { select: { code: true, status: true } },
        winner: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({
      games: games.map((g) => ({
        id: g.id,
        roomCode: g.room.code,
        createdAt: g.createdAt,
        finishedAt: g.finishedAt,
        winnerId: g.winnerId,
        winnerUsername: g.winner?.username ?? null,
        won: g.winnerId === req.user.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
