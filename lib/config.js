// Centralized API configuration.
//
// ONE environment variable controls every network connection:
//
//   NEXT_PUBLIC_BACKEND_URL
//     - empty / unset  -> same-origin (frontend and backend on one domain)
//     - set            -> https://api.example.com (separate deployments)
//
// REST client, Socket.IO URL derivation, media and every future subsystem read
// from this module. Do NOT hard-code backend URLs anywhere else.

function resolveBackendUrl() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  return raw.trim().replace(/\/+$/, ''); // strip trailing slashes
}

export const BACKEND_URL = resolveBackendUrl();

/** REST origin: same-origin (empty) or the configured backend. */
export function apiOrigin() {
  return BACKEND_URL;
}

/** Absolute URL for a REST path, e.g. apiUrl('/api/auth/login'). */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${p}`;
}

/** WebSocket/Socket.IO URL derived from the same backend setting. */
export function socketUrl() {
  if (!BACKEND_URL) return undefined; // same-origin: io() uses the page host
  const u = new URL(BACKEND_URL);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString().replace(/\/$/, '');
}

/** True when a remote backend is configured (false = same-origin mode). */
export function hasRemoteBackend() {
  return BACKEND_URL.length > 0;
}

/** Human hint used by the UI when the server cannot be reached. */
export const CONNECTION_HINT = hasRemoteBackend()
  ? `backend at ${BACKEND_URL}`
  : 'same-origin backend';
