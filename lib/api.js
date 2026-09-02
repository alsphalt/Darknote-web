// REST client with centralized error handling.
//
// - attaches the bearer token from localStorage (same key as AuthContext)
// - 10s timeout via AbortController
// - maps every failure mode to a friendly message + typed ApiError
// - NEVER leaves a rejected promise unhandled (see request() callers)

import { apiUrl } from './config.js';

export const TOKEN_KEY = 'ludo.token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export const FRIENDLY_ERRORS = {
  NETWORK: 'Unable to connect to the NOX server. Please check your connection and try again.',
  TIMEOUT: 'The server took too long to respond. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'That was not found. It may have been removed.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  SERVER_ERROR: 'Something went wrong on the server. Please try again.',
  DB_UNAVAILABLE: 'The game database is temporarily unavailable. Please try again shortly.',
  BAD_JSON: 'The request could not be processed.',
  DEFAULT: 'Request failed. Please try again.',
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK', fields = null, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields; // field -> message from server validation
    this.url = url;
  }
}

const REQUEST_TIMEOUT_MS = 10000;

/**
 * @param {string} method HTTP method
 * @param {string} path  e.g. '/api/auth/login'
 * @param {object} [opts] { body, token (default: from storage), raw }
 * @returns parsed JSON response
 * @throws {ApiError}
 */
export async function request(method, path, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || REQUEST_TIMEOUT_MS);

  const headers = { Accept: 'application/json' };
  const token = opts.token !== undefined ? opts.token : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      body,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    clearTimeout(timer);
    const timedOut = err?.name === 'AbortError';
    const message = timedOut ? FRIENDLY_ERRORS.TIMEOUT : FRIENDLY_ERRORS.NETWORK;
    throw new ApiError(message, { code: timedOut ? 'TIMEOUT' : 'NETWORK', url: path });
  }
  clearTimeout(timer);

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (proxy error pages etc.)
    data = null;
  }

  if (res.ok) return data;

  const serverMessage = data && typeof data.error === 'string' ? data.error : null;
  const code = data?.code || '';
  const status = res.status;

  let message = serverMessage;
  if (!message) {
    if (status === 401) message = FRIENDLY_ERRORS.UNAUTHORIZED;
    else if (status === 403) message = FRIENDLY_ERRORS.FORBIDDEN;
    else if (status === 404) message = FRIENDLY_ERRORS.NOT_FOUND;
    else if (status === 429) message = FRIENDLY_ERRORS.RATE_LIMITED;
    else if (status >= 500) message = FRIENDLY_ERRORS.SERVER_ERROR;
    else message = FRIENDLY_ERRORS.DEFAULT;
  }
  throw new ApiError(message, { status, code, fields: data?.fields ?? null, url: path });
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),
};
