import { prisma } from '../prisma.js';
import { resolveSession } from '../lib/sessions.js';

/**
 * Protects private REST routes. Requires `Authorization: Bearer <jwt>`.
 * Verifies the JWT signature/expiry AND that the referenced server-side
 * session is still alive (not revoked, not expired). Attaches:
 *   req.user    — { id, username, email, phone }
 *   req.session — the Session row
 */
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required.', code: 'UNAUTHORIZED' });
    }
    const session = await resolveSession(prisma, token);
    if (!session) {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.', code: 'SESSION_EXPIRED' });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, email: true, phone: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists.', code: 'ACCOUNT_MISSING' });
    }
    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    next(err);
  }
}
