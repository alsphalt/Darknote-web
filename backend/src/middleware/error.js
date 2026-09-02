import { logger } from '../lib/logger.js';

const DB_UNAVAILABLE = 'The game database is temporarily unavailable. Please try again shortly.';

function isDbUnavailable(err) {
  if (typeof err?.code === 'string' && (err.code.startsWith('P100') || err.code.startsWith('P101'))) return true;
  // Prisma lazy-connect failures surface as PrismaClientInitializationError
  // without a stable code; detect by message content instead.
  const message = typeof err?.message === 'string' ? err.message : '';
  return /can'?t reach database|connection (refused|timed out)|ECONNREFUSED|database server/i.test(message);
}

/** Translate Prisma/known errors into friendly client messages. */
export function normalizeError(err) {
  // Unique constraint (P2002) -> 409 with the offending field when possible
  if (err?.code === 'P2002') {
    const targets = Array.isArray(err.meta?.target) ? err.meta.target : [];
    const field = targets[0] || 'value';
    const label = { username: 'username', email: 'email', phone: 'phone' }[field] || field;
    const httpErr = new Error(`That ${label} is already registered.`);
    httpErr.status = 409;
    httpErr.code = 'CONFLICT';
    return httpErr;
  }
  if (err?.code === 'P2025') {
    const httpErr = new Error('The requested item was not found.');
    httpErr.status = 404;
    httpErr.code = 'NOT_FOUND';
    return httpErr;
  }
  if (isDbUnavailable(err)) {
    const httpErr = new Error(DB_UNAVAILABLE);
    httpErr.status = 503;
    httpErr.code = 'DB_UNAVAILABLE';
    return httpErr;
  }
  if (err?.type === 'entity.parse.failed') {
    const httpErr = new Error('Request body must be valid JSON.');
    httpErr.status = 400;
    httpErr.code = 'BAD_JSON';
    return httpErr;
  }
  return err;
}

/** 404 handler — mounts after all routes. */
export function notFound(req, res) {
  res.status(404).json({ error: 'Route not found.', code: 'NOT_FOUND' });
}

/** Centralized error handler — last middleware. Never leaks stack traces. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);
  const status = Number.isInteger(normalized?.status) ? normalized.status : 500;
  const code = normalized?.code || (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR');

  if (status >= 500 && status !== 503) {
    logger.error('Request failed', {
      method: req.method,
      url: req.originalUrl,
      status,
      message: normalized?.message,
      stack: normalized?.stack,
    });
    return res.status(status).json({
      error: 'Something went wrong on our side. Please try again.',
      code,
    });
  }
  if (status === 503) {
    logger.error('Request failed (service unavailable)', { method: req.method, url: req.originalUrl, code });
    return res.status(503).json({ error: normalized?.message || DB_UNAVAILABLE, code });
  }
  logger.warn('Request rejected', { method: req.method, url: req.originalUrl, status, code });
  res.status(status).json({ error: normalized?.message || 'Request failed.', code });
}
