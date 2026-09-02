import jwt from 'jsonwebtoken';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_TTL_S = 7 * 24 * 60 * 60; // 7 days

/**
 * Create a login session row + signed JWT.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{id:string}} user
 * @param {{deviceLabel?:string, userAgent?:string, ip?:string}} meta
 */
export async function createSession(prisma, user, meta = {}) {
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      deviceLabel: meta.deviceLabel || 'Web',
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
      ip: meta.ip || null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  const token = jwt.sign({ sub: user.id, sid: session.id }, process.env.JWT_SECRET, {
    expiresIn: SESSION_TTL_S,
    issuer: 'ludo-server',
  });
  return { session, token };
}

/** Resolve a JWT into a live session row (revoked/expired rejected). */
export async function resolveSession(prisma, token) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'ludo-server' });
  } catch {
    return null; // invalid / expired / wrong issuer
  }
  if (!payload?.sub || !payload?.sid) return null;
  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.userId !== payload.sub) return null;
  return session;
}
