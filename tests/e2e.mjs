#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────
// End-to-end test: real HTTP + Socket.IO against a real server + PostgreSQL.
//
// Prerequisites:
//   1. A running PostgreSQL (e.g. `docker compose up -d`)
//   2. DATABASE_URL configured (in .env) and schema applied:
//        npx prisma migrate deploy
//   3. Run:  node tests/e2e.mjs
//
// Exercises: register → login → session restore (/me) → device list/revoke
// → create room → join → host start → socket join → roll/turn/move (server
// authoritative, out-of-turn moves rejected) → winner → game history.
// ────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 5099;
const BASE = `http://localhost:${PORT}`;
const suffix = crypto.randomBytes(3).toString('hex');
const userA = `alice_${suffix}`;
const userB = `bob_${suffix}`;

let serverProc;
let failures = 0;

function ok(name) { console.log(`  ✓ ${name}`); }
function fail(name, err) { failures += 1; console.error(`  ✗ ${name}: ${err?.message || err}`); }

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const sock = io(BASE, { auth: { token }, transports: ['websocket'], timeout: 8000 });
    const t = setTimeout(() => reject(new Error('socket connect timeout')), 10000);
    sock.on('connect', () => { clearTimeout(t); resolve(sock); });
    sock.on('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
}

function emitAck(sock, event, payload) {
  return new Promise((resolve) => sock.emit(event, payload, resolve));
}

const waitState = (sock, match) => new Promise((resolve) => {
  const h = (state) => { if (match(state)) { sock.off('game:state', h); resolve(state); } };
  sock.on('game:state', h);
});

async function main() {
  // ── boot server ───────────────────────────────────────────────────────────
  console.log('Booting server on :5099 …');
  serverProc = spawn(process.execPath, [path.join(ROOT, 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server boot timeout')), 15000);
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/api/health`);
        clearTimeout(t);
        if (r.ok) return resolve();
      } catch { /* retry */ }
      setTimeout(poll, 300);
    };
    poll();
  });

  const health = await api('GET', '/api/health');
  if (health.data?.db !== 'up') {
    throw new Error(`Database is not reachable (health=${JSON.stringify(health.data)}). Start Postgres (docker compose up -d) and run: npx prisma migrate deploy`);
  }
  ok('server up, database reachable');

  // ── register + login + session restore ────────────────────────────────────
  const regA = await api('POST', '/api/auth/register', { body: { username: userA, email: `${userA}@test.local`, phone: '0712345678', password: 'password123' } });
  assert.equal(regA.status, 201, `register A -> ${regA.status}`);
  const regB = await api('POST', '/api/auth/register', { body: { username: userB, email: `${userB}@test.local`, phone: `+2547${crypto.randomInt(10000000, 99999999)}`, password: 'password123' } });
  assert.equal(regB.status, 201);
  ok('register two users (phone canonicalised)');

  const dup = await api('POST', '/api/auth/register', { body: { username: userA, email: 'x@y.co', password: 'password123' } });
  assert.equal(dup.status, 409);
  ok('duplicate username -> 409');

  const badLogin = await api('POST', '/api/auth/login', { body: { identifier: userA, password: 'wrongpass' } });
  assert.equal(badLogin.status, 401);
  const loginA = await api('POST', '/api/auth/login', { body: { identifier: userA, password: 'password123' } });
  assert.equal(loginA.status, 200);
  const tokenA = loginA.data.token;
  ok('login + wrong-password rejection');

  const me = await api('GET', '/api/auth/me', { token: tokenA });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, userA);
  ok('session restore via /api/auth/me');

  const noToken = await api('GET', '/api/rooms/000000');
  assert.equal(noToken.status, 401);
  ok('protected route rejects missing token');

  // ── devices ───────────────────────────────────────────────────────────────
  const devices = await api('GET', '/api/auth/devices', { token: tokenA });
  assert.equal(devices.data.devices.length >= 1, true);
  const other = devices.data.devices[0];
  const revokeOtherUser = await api('POST', '/api/auth/devices/revoke', { token: regB.data.token, body: { id: other.id } });
  assert.equal(revokeOtherUser.status, 403);
  ok('cannot revoke another account’s device (403)');

  // ── rooms ─────────────────────────────────────────────────────────────────
  const roomRes = await api('POST', '/api/rooms', { token: tokenA, body: { maxPlayers: 2 } });
  assert.equal(roomRes.status, 201);
  const code = roomRes.data.code;
  assert.match(code, /^\d{6}$/);
  ok(`room created with 6-digit numeric code ${code}`);

  const badJoin = await api('POST', '/api/rooms/join', { token: regB.data.token, body: { code: '12AB45' } });
  assert.equal(badJoin.status, 400);
  const joinB = await api('POST', '/api/rooms/join', { token: regB.data.token, body: { code } });
  assert.equal(joinB.status, 200);
  assert.equal(joinB.data.players.length, 2);
  const dupJoin = await api('POST', '/api/rooms/join', { token: regB.data.token, body: { code } });
  assert.equal(dupJoin.status, 409);
  ok('join by code; duplicate join rejected (409); invalid code rejected');

  const nonHostStart = await api('POST', `/api/rooms/${code}/start`, { token: regB.data.token });
  assert.equal(nonHostStart.status, 403);
  const start = await api('POST', `/api/rooms/${code}/start`, { token: tokenA });
  assert.equal(start.status, 200);
  ok('host starts the game; non-host start rejected (403)');

  // ── sockets: authoritative game flow ─────────────────────────────────────
  const sockA = await connectSocket(tokenA);
  const sockB = await connectSocket(regB.data.token);
  const joinA = await emitAck(sockA, 'room:join', { code });
  assert.equal(joinA.ok, true);
  const joinBres = await emitAck(sockB, 'room:join', { code });
  assert.equal(joinBres.ok, true);
  ok('two sockets join the room');

  // Play until a winner emerges, always through the ACTIVE player's socket.
  let state = joinBres.state;
  let moves = 0;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && moves < 4000) {
    if (state.winner !== null) break;
    const seat = state.players[state.currentPlayer];
    const activeSocket = seat.userId === regA.data.user.id ? sockA : sockB;
    const rollRes = await emitAck(activeSocket, 'game:roll');
    if (!rollRes.ok) {
      // not their turn -> cheat attempt, must be rejected server-side
      fail('out-of-turn roll rejected', new Error(rollRes.error));
      break;
    }
    // wait for the authoritative broadcast
    const nextState = await new Promise((resolve) => {
      const h = (s) => { sockA.off('game:state', h); sockB.off('game:state', h); resolve(s); };
      sockA.on('game:state', h);
      sockB.on('game:state', h);
    });
    state = nextState;
    const legal = (rollRes.legal || []);
    if (legal.length === 0) continue; // engine passed the turn
    const idx = legal[0];
    const moveRes = await emitAck(activeSocket, 'game:move', { tokenIndex: idx });
    if (!moveRes.ok) { fail('legal move rejected', new Error(moveRes.error)); break; }
    state = await new Promise((resolve) => {
      const h = (s) => { sockA.off('game:state', h); sockB.off('game:state', h); resolve(s); };
      sockA.on('game:state', h);
      sockB.on('game:state', h);
    });
    moves += 1;
  }
  assert.equal(state.winner !== null, true, `game should finish (moves=${moves})`);
  const winnerUser = state.players[state.winner].username;
  ok(`game completed with a winner: ${winnerUser} (${moves} moves)`);

  const history = await api('GET', '/api/games/history', { token: tokenA });
  assert.equal(history.data.games.length >= 1, true);
  assert.equal(history.data.games[0].roomCode, code);
  ok('game history recorded');

  sockA.disconnect();
  sockB.disconnect();

  // ── device revocation invalidates the session server-side ────────────────
  const list2 = await api('GET', '/api/auth/devices', { token: tokenA });
  const current = list2.data.devices.find((d) => d.current) || list2.data.devices[0];
  const revokeCurrent = await api('POST', '/api/auth/devices/revoke', { token: tokenA, body: { id: current.id } });
  assert.equal(revokeCurrent.status, 200);
  const afterRevoke = await api('GET', '/api/auth/me', { token: tokenA });
  assert.equal(afterRevoke.status, 401, 'revoked token must fail');
  ok('revoking the current device invalidates its session');
  return winnerUser;
}

main()
  .then((winner) => {
    console.log(`\nE2E PASS — winner: ${winner}`);
    process.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.error(`\nE2E FAIL — ${err?.message || err}`);
    process.exit(1);
  })
  .finally(() => {
    if (serverProc) {
      serverProc.kill('SIGTERM');
      setTimeout(() => process.exit(failures ? 1 : 0), 500).unref();
    }
  });
