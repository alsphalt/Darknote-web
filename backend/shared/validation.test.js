import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeKenyanPhone,
  isValidKenyanPhone,
  normalizeBetCode,
  validateRoomCode,
  ROOM_MODE,
  validateUsername,
  validateEmail,
  validatePassword,
  validateRegisterInput,
} from './validation.js';

test('Kenyan phone: accepted formats normalize to canonical +254…', () => {
  assert.equal(normalizeKenyanPhone('0712345678'), '+254712345678');
  assert.equal(normalizeKenyanPhone('+254712345678'), '+254712345678');
  assert.equal(normalizeKenyanPhone('254712345678'), '+254712345678');
  assert.equal(normalizeKenyanPhone(' 0112 345 678 '), '+254112345678');
  assert.equal(normalizeKenyanPhone('0112345678'), '+254112345678'); // 01x series (new numbers)
  assert.equal(normalizeKenyanPhone('0734567890'), '+254734567890'); // Airtel/Telkom ranges
});

test('Kenyan phone: rejects non-mobile / invalid inputs', () => {
  for (const bad of ['', '12345', '0212345678', '+254212345678', '254212345678',
    '071234567', '07123456789', '01123456789', 'abc', '+254 712 345 678 extra', null, undefined]) {
    assert.equal(normalizeKenyanPhone(bad), null, `should reject: ${bad}`);
    assert.equal(isValidKenyanPhone(bad), false, `isValid should be false: ${bad}`);
  }
});

test('Room codes: normal game is exactly 6 digits, no letters', () => {
  assert.equal(validateRoomCode('731482').valid, true);
  assert.equal(validateRoomCode('000000').valid, true);
  // surrounding whitespace from copy/paste is tolerated (trimmed, not part of the code)
  const spaced = validateRoomCode(' 731482 ');
  assert.equal(spaced.valid, true);
  assert.equal(spaced.normalized, '731482');
  for (const bad of ['73148', '7314821', '7314A2', 'ABCDEF', '73148a', '']) {
    const r = validateRoomCode(bad);
    assert.equal(r.valid, false, `normal code should be invalid: ${bad}`);
  }
});

test('Room codes: bet game is 3 digits + 4 uppercase letters, normalized', () => {
  const ok = validateRoomCode('731ABCD', ROOM_MODE.BET);
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized, '731ABCD');
  // lowercase input normalizes to uppercase
  const lc = validateRoomCode('731abcd', ROOM_MODE.BET);
  assert.equal(lc.valid, true);
  assert.equal(lc.normalized, '731ABCD');
  assert.equal(normalizeBetCode(' 731abcd '), '731ABCD');
  for (const bad of ['731ABC', '731ABCDE', '73ABCD', '731ab1d', '731abc!', 'A1B2C3D4']) {
    assert.equal(validateRoomCode(bad, ROOM_MODE.BET).valid, false, `bet code should be invalid: ${bad}`);
  }
  // a normal 6-digit code is NOT a valid bet code and vice versa
  assert.equal(validateRoomCode('731482', ROOM_MODE.BET).valid, false);
  assert.equal(validateRoomCode('731ABCD', ROOM_MODE.NORMAL).valid, false);
});

test('Account field validators', () => {
  assert.equal(validateUsername('player_1').valid, true);
  assert.equal(validateUsername('ab').valid, false);
  assert.equal(validateUsername('has space').valid, false);
  assert.equal(validateEmail('a@b.co').valid, true);
  assert.equal(validateEmail('not-an-email').valid, false);
  assert.equal(validatePassword('12345678').valid, true);
  assert.equal(validatePassword('short').valid, false);
  assert.equal(validatePassword('x'.repeat(73)).valid, false);
});

test('validateRegisterInput combines rules and canonicalizes phone', () => {
  const r = validateRegisterInput({
    username: 'Player1',
    email: 'PLAYER@EXAMPLE.COM',
    password: 'secret123',
    phone: '0712345678',
  });
  assert.equal(r.valid, true);
  assert.equal(r.values.username, 'player1');
  assert.equal(r.values.email, 'player@example.com');
  assert.equal(r.values.phone, '+254712345678');

  const bad = validateRegisterInput({ username: 'x', email: 'nope', password: '1', phone: '+44 20 7946' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.username && bad.errors.email && bad.errors.password && bad.errors.phone);
});
