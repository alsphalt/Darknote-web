// Development-safe leveled logger.
//
// - Never logs tokens, passwords or raw authorization headers (redacted).
// - Level controlled by LOG_LEVEL (silent|error|warn|info|debug); defaults to
//   "info" in development and "warn" in production.
// - Server logs are for operators only; they are NEVER sent to clients.

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function effectiveLevel() {
  if (process.env.LOG_LEVEL && process.env.LOG_LEVEL in LEVELS) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info';
}

const current = effectiveLevel();

const SECRET_PATTERNS = [
  /(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi,
  /(password\s*[:=]\s*")[^"]+"/gi,
  /(token\s*[:=]\s*")[^"]+"/gi,
  /(password\s*[:=]\s*')[^']+'/gi,
];

export function redact(input) {
  if (typeof input !== 'string') return input;
  let out = input;
  for (const re of SECRET_PATTERNS) out = out.replace(re, '$1[REDACTED]');
  return out;
}

function write(level, args) {
  if (LEVELS[current] < LEVELS[level]) return;
  const ts = new Date().toISOString();
  const line = args
    .map((a) => (typeof a === 'string' ? a : safeJson(a)))
    .join(' ');
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  method(`[${ts}] ${level.toUpperCase()} ${redact(line)}`);
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  error: (...args) => write('error', args),
  warn: (...args) => write('warn', args),
  info: (...args) => write('info', args),
  debug: (...args) => write('debug', args),
  level: current,
};
