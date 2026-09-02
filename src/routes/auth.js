import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { createSession } from '../lib/sessions.js';
import { logger } from '../lib/logger.js';
import {
  validateRegisterInput,
  validateUsername,
  validateEmail,
  validatePassword,
  normalizeKenyanPhone,
} from '../../shared/validation.js';

const router = Router();

/** Best-effort device label / IP metadata from a request. */
function metaFrom(req, extraLabel) {
  return {
    deviceLabel: typeof extraLabel === 'string' && extraLabel.trim() ? extraLabel.trim().slice(0, 60) : 'Web',
    userAgent: req.headers['user-agent'] || null,
    ip: req.ip || null,
  };
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, phone: user.phone ?? null };
}

// ── Register ────────────────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const check = validateRegisterInput(req.body || {});
    if (!check.valid) {
      return res.status(400).json({ error: 'Please fix the highlighted fields.', code: 'VALIDATION', fields: check.errors });
    }
    const { username, email, password, phone } = check.values;

    // Pre-check duplicates for accurate field-level 409s (race still handled by unique index)
    const [byUser, byEmail, byPhone] = await Promise.all([
      prisma.user.findUnique({ where: { username }, select: { id: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      phone ? prisma.user.findUnique({ where: { phone }, select: { id: true } }) : Promise.resolve(null),
    ]);
    if (byUser) return res.status(409).json({ error: 'That username is already registered.', code: 'CONFLICT', field: 'username' });
    if (byEmail) return res.status(409).json({ error: 'That email is already registered.', code: 'CONFLICT', field: 'email' });
    if (byPhone) return res.status(409).json({ error: 'That phone number is already registered.', code: 'CONFLICT', field: 'phone' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, phone, password: hashed },
    });

    const { token } = await createSession(prisma, user, metaFrom(req, req.body?.deviceName));
    logger.info(`Registered user ${user.username} (${user.id})`);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    next(err); // P2002 races -> 409 via normalizeError
  }
});

// ── Login (username, email or phone) ────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required.', code: 'VALIDATION' });
    }

    let user = null;
    if (identifier.includes('@')) {
      const email = validateEmail(identifier).valid ? identifier.toLowerCase() : null;
      if (email) user = await prisma.user.findUnique({ where: { email } });
    } else {
      const asPhone = normalizeKenyanPhone(identifier);
      user = asPhone
        ? await prisma.user.findUnique({ where: { phone: asPhone } })
        : null;
      if (!user) {
        const asUser = validateUsername(identifier);
        if (asUser.valid) user = await prisma.user.findUnique({ where: { username: asUser.normalized } });
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.', code: 'INVALID_CREDENTIALS' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.', code: 'INVALID_CREDENTIALS' });
    }

    const { token } = await createSession(prisma, user, metaFrom(req, req.body?.deviceName));
    logger.info(`User ${user.username} logged in (${user.id})`);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ── Session restore / verification ─────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: publicUser(req.user), session: { id: req.session.id } });
});
router.get('/verify', authenticate, async (req, res) => {
  res.json({ valid: true, user: publicUser(req.user) });
});

// ── Logout (revoke THIS session server-side) ───────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await prisma.session.update({
      where: { id: req.session.id },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Device management ──────────────────────────────────────────────────────
router.get('/devices', authenticate, async (req, res, next) => {
  try {
    const devices = await prisma.session.findMany({
      where: { userId: req.user.id },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceLabel: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    res.json({
      devices: devices.map((d) => ({
        ...d,
        current: d.id === req.session.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Only the session OWNER may revoke; a session belonging to another user is 403.
router.post('/devices/revoke', authenticate, async (req, res, next) => {
  try {
    const targetId = typeof req.body?.id === 'string' ? req.body.id : '';
    if (!targetId) return res.status(400).json({ error: 'Device id is required.', code: 'VALIDATION' });
    const target = await prisma.session.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ error: 'Device not found.', code: 'NOT_FOUND' });
    if (target.userId !== req.user.id) {
      return res.status(403).json({ error: 'You cannot manage another account’s devices.', code: 'FORBIDDEN' });
    }
    if (target.revokedAt) {
      return res.json({ ok: true, current: target.id === req.session.id }); // idempotent
    }
    await prisma.session.update({ where: { id: targetId }, data: { revokedAt: new Date() } });
    const current = target.id === req.session.id;
    logger.info(`User ${req.user.id} revoked session ${targetId}${current ? ' (current)' : ''}`);
    res.json({ ok: true, current });
  } catch (err) {
    next(err);
  }
});

// Re-export helpers for tests/other routes
export const _helpers = { metaFrom, publicUser, validate: { validateUsername, validateEmail, validatePassword } };
export default router;
