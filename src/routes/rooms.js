import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';

const prisma = new PrismaClient();
const router = express.Router();

// Generate 6-digit alphanumeric room code
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Create room
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const code = generateRoomCode();
    const room = await prisma.room.create({
      data: {
        code,
        hostId: userId,
        players: {
          create: { userId },
        },
      },
      include: { players: { include: { user: true } } },
    });
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Join room by code
router.post('/join', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.userId;
    const room = await prisma.room.findUnique({
      where: { code },
      include: { players: true },
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'waiting') return res.status(400).json({ error: 'Game already started' });
    if (room.players.length >= room.maxPlayers) return res.status(400).json({ error: 'Room full' });

    // Assign next available color (we'll store order)
    const colors = ['red', 'green', 'yellow', 'blue'];
    const usedColors = room.players.map(p => p.color).filter(Boolean);
    const available = colors.find(c => !usedColors.includes(c));

    await prisma.roomUser.create({
      data: { userId, roomId: room.id, color: available },
    });

    const updatedRoom = await prisma.room.findUnique({
      where: { id: room.id },
      include: { players: { include: { user: true } } },
    });
    res.json(updatedRoom);
  } catch (error) {
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Get room details
router.get('/:roomId', authenticate, async (req, res) => {
  try {
    const room = await prisma.room.findUnique({
      where: { id: req.params.roomId },
      include: { players: { include: { user: true } }, game: true },
    });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
