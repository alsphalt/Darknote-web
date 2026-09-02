import 'dotenv/config'; // load .env FIRST so DATABASE_URL/JWT_SECRET/PORT are always available
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';

import { prisma } from './prisma.js';
import { logger } from './lib/logger.js';
import authRoutes from './routes/auth.js';
import buildRoomRoutes from './routes/rooms.js';
import gamesRoutes from './routes/games.js';
import attachSocketHandlers from './socket/socketHandlers.js';
import { notFound, errorHandler } from './middleware/error.js';

function allowedOrigins() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createServer() {
  const app = express();
  const server = http.createServer(app);
  const origins = allowedOrigins();

  const io = new Server(server, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
      credentials: false,
    },
    maxHttpBufferSize: 64 * 1024, // chat/media uploads are separate; small payloads only
  });

  // ── Security headers ─────────────────────────────────────────────────────
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Trust a single reverse proxy hop only when explicitly enabled (Vercel/Railway etc.)
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

  // ── CORS (explicit allow-list; no wildcard) ──────────────────────────────
  app.use(cors({
    origin(origin, cb) {
      if (!origin || origins.includes(origin)) return cb(null, true);
      return cb(null, false); // no CORS headers -> browser blocks cross-origin reads
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── Body parsing (bounded) ───────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));

  // ── Rate limiting (per IP) ───────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' },
  });
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api', apiLimiter);

  // ── Routes ───────────────────────────────────────────────────────────────
  app.get('/api/health', async (_req, res) => {
    let db = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    res.json({ ok: true, db, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', buildRoomRoutes(io));
  app.use('/api/games', gamesRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);

  // ── Realtime (authenticated, server-authoritative) ───────────────────────
  attachSocketHandlers(io);

  return { app, server, io };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Start listening only when executed directly (not when imported by tests). */
async function start() {
  // Env sanity: refuse obviously insecure/placeholder configuration in production.
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (process.env.NODE_ENV === 'production' && missing.length) {
    logger.error(`Refusing to start in production: missing ${missing.join(', ')}. See .env.example.`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'your_super_secret_key') {
    logger.warn('JWT_SECRET is still the placeholder value. Generate a real secret (openssl rand -hex 32).');
  }

  const { server, io } = await createServer();
  const PORT = Number(process.env.PORT) || 5000;
  server.listen(PORT, () => {
    logger.info(`NOX server listening on :${PORT}`);
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully…`);
    io.close();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Hard exit if something hangs
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__dirname, 'index.js');
if (isMain) start();

export default createServer;
