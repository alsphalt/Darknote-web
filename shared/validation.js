// Shared validation rules — used by BOTH the backend (authoritative) and the
// frontend (UX). The backend ALWAYS re-validates; the frontend copy is only a
// convenience. No Node built-ins, no React.

// ─────────────────────────────────────────────────────────────
// Kenyan phone numbers
// ─────────────────────────────────────────────────────────────
// Accepts the real-world formats:
//   0712345678     (national, leading 0)
//   +254712345678  (international with +)
//   254712345678   (international without +)
// Also tolerates separators (spaces / dashes) that users paste.
//
// Mobile numbers in Kenya currently start with 7 or 1 followed by 8 digits
// (Safaricom, Airtel, Telkom, Equitel, Faiba series all fall inside
// 07X… / 01X… ranges). Validation therefore accepts ANY of those series
// instead of a hard-coded subset that would reject valid numbers.

const KE_MOBILE_NSN_RE = /^[17]\d{8}$/; // national significant number: 9 digits

/**
 * Normalize any supported Kenyan mobile format into canonical `+254XXXXXXXXX`.
 * @param {string} raw
 * @returns {string|null} canonical number, or null when not a valid Kenyan mobile number
 */
export function normalizeKenyanPhone(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[\s-]/g, '');
  if (!s) return null;

  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('254')) s = s.slice(3);
  else if (s.startsWith('0')) s = s.slice(1);

  if (!KE_MOBILE_NSN_RE.test(s)) return null;
  return `+254${s}`;
}

/**
 * @param {string} raw
 * @returns {boolean} true when `raw` is a valid Kenyan mobile number
 */
export function isValidKenyanPhone(raw) {
  return normalizeKenyanPhone(raw) !== null;
}

// ─────────────────────────────────────────────────────────────
// Ludo room codes
// ─────────────────────────────────────────────────────────────
export const ROOM_MODE = {
  NORMAL: 'normal',
  BET: 'bet',
};

export const NORMAL_ROOM_CODE_RE = /^\d{6}$/; // exactly 6 numeric digits
export const BET_ROOM_CODE_RE = /^\d{3}[A-Z]{4}$/; // 3 digits + 4 uppercase letters

/**
 * Normalize a Bet Game code to uppercase (e.g. "731abcd" -> "731ABCD").
 */
export function normalizeBetCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

/**
 * Validate a room code for a given mode. Bet codes are normalized to uppercase
 * first. Returns { valid, normalized?, error? }.
 */
export function validateRoomCode(code, mode = ROOM_MODE.NORMAL) {
  if (typeof code !== 'string') {
    return { valid: false, error: 'Room code is required.' };
  }
  const trimmed = code.trim();

  if (mode === ROOM_MODE.BET) {
    const upper = trimmed.toUpperCase();
    if (!BET_ROOM_CODE_RE.test(upper)) {
      return { valid: false, error: 'Bet room codes must be 3 digits followed by 4 uppercase letters (e.g. 731ABCD).' };
    }
    return { valid: true, normalized: upper };
  }

  if (!NORMAL_ROOM_CODE_RE.test(trimmed)) {
    return { valid: false, error: 'Room code must be exactly 6 digits (e.g. 731482).' };
  }
  return { valid: true, normalized: trimmed };
}

// ─────────────────────────────────────────────────────────────
// Account fields
// ─────────────────────────────────────────────────────────────
export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt truncates beyond 72 bytes

export function validateUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
    return { valid: false, error: 'Username must be 3-20 characters (letters, numbers, underscore).' };
  }
  return { valid: true, normalized: username.trim().toLowerCase() };
}

export function validateEmail(email) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return { valid: true, normalized: email.trim().toLowerCase() };
}

export function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < PASSWORD_MIN) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  if (password.length > PASSWORD_MAX) {
    return { valid: false, error: `Password must be at most ${PASSWORD_MAX} characters.` };
  }
  return { valid: true, normalized: password };
}

/**
 * Validate the fields of a register request (phone is optional).
 * Returns { valid, errors: {field: message}, values }.
 */
export function validateRegisterInput(body) {
  const errors = {};
  const username = validateUsername(body?.username);
  if (!username.valid) errors.username = username.error;

  const email = validateEmail(body?.email);
  if (!email.valid) errors.email = email.error;

  const password = validatePassword(body?.password);
  if (!password.valid) errors.password = password.error;

  let phone = null;
  if (body?.phone !== undefined && body?.phone !== null && String(body.phone).trim() !== '') {
    phone = normalizeKenyanPhone(String(body.phone));
    if (!phone) errors.phone = 'Phone must be a valid Kenyan mobile number, e.g. 0712345678 or +254712345678.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: {
      username: username.normalized,
      email: email.normalized,
      password: password.normalized,
      phone,
    },
  };
}
