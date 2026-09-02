// Client-side development-safe logger.
// - Never logs tokens, passwords, or authorization headers.
// - Disabled by default in production builds (override with NEXT_PUBLIC_DEBUG=1).

const ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG === '1';

const REDACT = [
  /(token["']?\s*[:=]\s*["'])[^"']+/gi,
  /(password["']?\s*[:=]\s*["'])[^"']+/gi,
  /(authorization["']?\s*[:=]\s*["']?Bearer\s+)[^\s,"']+/gi,
];

export function redact(value) {
  let s = typeof value === 'string' ? value : safeString(value);
  for (const re of REDACT) s = s.replace(re, '$1[REDACTED]');
  return s;
}

function safeString(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level, args) {
  if (!ENABLED) return;
  const line = args.map(redact).join(' ');
  // eslint-disable-next-line no-console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${new Date().toISOString()}] ${level.toUpperCase()} ${line}`);
}

export const log = {
  error: (...a) => write('error', a),
  warn: (...a) => write('warn', a),
  info: (...a) => write('info', a),
  debug: (...a) => write('debug', a),
};
