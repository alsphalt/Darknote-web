# NOX — Complete Technical Audit & Repair Report

Project: `alsphalt/Darknote-web1` (application identity inside the repo: **Ludo**,
package `ludo-frontend`). Date: 2026-09-02.

**Important scope statement.** The repair spec repeatedly refers to a single-file
`NOX.html` application with Chats, Updates/Status, WebRTC Calls, M-PESA payments
and a Bet Game. **None of those subsystems exist in this repository.** This repo
contained a Next.js + Express + Socket.IO + Prisma *Ludo* scaffold with a broken
build and non-functional game flow. The repair therefore made the code that
actually exists genuinely work (auth, rooms, sockets, server-authoritative Ludo,
security, deployment) and — per the spec's "no fake implementations" rule —
**did not invent** the absent subsystems. Sections below mark what was repaired
vs. what is absent and why.

---

## 1. Files changed

Backend (`src/`):
- `src/index.js` — rewritten: CORS allow-list, security headers, JSON size limit,
  rate limiting (auth + API), `/api/health`, JSON 404/error pipeline, env sanity
  checks, graceful shutdown
- `src/prisma.js` — **new**: single shared PrismaClient
- `src/lib/logger.js` — **new**: dev-safe leveled logger with secret redaction
- `src/lib/sessions.js` — **new**: session creation + JWT verify/resolve helpers
- `src/middleware/auth.js` — rewritten: JWT (exp, issuer) + live Session row check
- `src/middleware/error.js` — **new**: friendly 400/401/403/404/409/429/500/503
  JSON errors; Prisma mapping; DB-unavailable detection; no stack leaks
- `src/routes/auth.js` — rewritten: register/login/me/verify/logout/devices/
  devices-revoke with validation & field-level 409s
- `src/routes/rooms.js` — rewritten: create/join/get/start/leave by 6-digit code
- `src/routes/games.js` — **new**: `GET /api/games/history`
- `src/socket/socketHandlers.js` — rewritten: authenticated handshake, room
  membership checks, server dice/engine, turn timeout auto-play, reconnect-safe
- `src/services/ludoService.js` — **new**: shared authoritative-state + DB service

Shared pure logic (`shared/`) — used identically by server and client:
- `shared/constants.js`, `shared/validation.js`, `shared/ludo.js` (engine),
  `shared/layout.js` (render geometry) — all **new**
- unit tests: `shared/validation.test.js`, `shared/ludo.test.js`,
  `shared/layout.test.js` — **new**

Frontend:
- `app/layout.js` — providers + metadata; `app/providers.jsx` — **new** AuthProvider
- `app/page.js` — rewritten (auth gate → lobby)
- `app/room/[code]/page.js` — rewritten (code validation, auth guard)
- `app/globals.css` — cleaned (removed broken fixed-centering/overflow)
- `contexts/SocketContext.Js` → **deleted**; `contexts/SocketContext.js` **new**
- `contexts/AuthContext.jsx`, `hooks/useAuth.js` — **new**
- `lib/config.js`, `lib/api.js`, `lib/clipboard.js`, `lib/log.js` — **new**
- `components/AuthScreen.jsx`, `components/Lobby.jsx`, `components/RoomScreen.jsx` — **new**
- `components/Board.js` — rebuilt from a non-functional stub into the real SVG
  board driven by authoritative state
- `components/Board.module.css` — rewritten for the new board
- `components/Dice.js`, `Dice3D.js`, `Dice.module.css`, `Dice3D.module.css` —
  deleted (two unused local-random dice implementations; dice are now
  server-authoritative and rendered inside `Board`)

Config/infra:
- `package.json` — ESM type, backend dependencies, scripts, engines
- `.gitignore` (+ `.env`, `.env*.local` untracked), `.env.example` — **new**
- `prisma/schema.prisma` — fixed invalid relations; added `Session`, `User.phone`,
  `Room.mode`
- `prisma/migrations/20260902000000_init/migration.sql` — committed baseline
- `docker-compose.yml`, `README.md`, `docs/AUDIT.md`, `docs/FINAL_REPORT.md` — **new**
- `tests/e2e.mjs` — **new** full-chain E2E harness

## 2. Bugs discovered (root causes)

1. Build blockers: missing `hooks/useAuth` import; `SocketContext.Js` extension
   case; `Board.js` was a stub (render code replaced by comments); home page
   mounted `Board` without its provider (context throws); no backend deps in
   `package.json`; no `"type":"module"`.
2. Prisma schema invalid (relations without opposite fields) — the committed
   schema never passed `prisma validate`.
3. Socket layer: `applyMove`/`saveMove` **called but never defined** (crash on
   first move); client-supplied `userId` trusted; no handshake auth; room lookup
   keyed on `id` while the UI sends the join `code`.
4. Room-code generator produced 6 *hex* chars, violating the numeric-6 format.
5. Register: no validation; every failure (incl. DB down) reported as
   `400 User already exists`; no duplicate-field detail; no phone.
6. JWT: no expiry, no issuer, placeholder secret committed in `.env`.
7. No REST client, no centralized API config, no timeout/error handling, no
   clipboard helper, no auth UI, no session restore, no reconnect handling.
8. Dice rolled client-side; winner check `!== null` misfired on `undefined`;
   token movement math mixed absolute/relative positions.
9. CORS wide open; no rate limits; no security headers; no JSON error pipeline.
10. Turn/winner/game-start logic entirely absent server-side; game state lost on
    disconnect/reconnect.

## 3. Bugs fixed
All items in §2 were fixed in the code (see per-area sections). Unit tests pin
the engine/validation/layout behavior; the production build passes.

## 4. API endpoints added
- `POST /api/auth/register`, `POST /api/auth/login` (rebuilt), `GET /api/auth/me`,
  `GET /api/auth/verify`, `POST /api/auth/logout`, `GET /api/auth/devices`,
  `POST /api/auth/devices/revoke`
- `GET /api/rooms/:code`, `POST /api/rooms/:code/start`, `POST /api/rooms/:code/leave`
- `GET /api/games/history`
- `GET /api/health`

## 5. API endpoints repaired
- `POST /api/rooms` — numeric 6-digit code + uniqueness retry; maxPlayers 2-4
- `POST /api/rooms/join` — code validation, duplicate-join 409, full-room 400,
  color assignment, broadcasts room update
- Every route now: method/URL consistent, authenticated (`Bearer` JWT+session),
  validated, consistent error JSON (no raw stack traces), frontend-compatible
  shapes returned by the frontend's typed REST client.

Spec-listed endpoints that do NOT exist in this codebase and were **not** faked:
`/api/users/blocked`, `/api/users/unblock/:id`, `/api/status/*`, `/api/games/points`,
`/api/media/*`, `/api/chats`, `/api/calls`, `/api/users/contacts`,
`/api/auth/verify` **as SMS code** — chat/calls/status/media/payments have no
backend or UI here (see §22).

## 6. Database changes
- `User`: added optional unique `phone` (canonical `+254…`), fixed relations.
- **`Session`** model (new): device label, user-agent, IP, created/lastSeen/
  expires/revoked — powers real device management and server-side revocation.
- `Room`: added `mode` (`normal`; `bet` reserved and refused until payments exist).
- Repaired relation fields (`hostRooms`, `wins`, `moves`).
- Committed offline baseline migration SQL (applies with `prisma migrate deploy`).

## 7. Authentication changes
- Server-side sessions: register/login create a Session row + short-lived JWT
  (`sub`+`sid`, 7d, issuer-verified); **every** protected route and every socket
  handshake resolves the session row and rejects revoked/expired sessions.
- Validation: username 3-20 `[A-Za-z0-9_]`, email format, password 8-72,
  optional Kenyan mobile phone (shared rules, server-enforced).
- Field-level 409s for duplicate username/email/phone; login by username, email
  or phone; generic 401 for bad credentials; logout revokes the session;
  device list/revoke with ownership enforcement (403 for other users);
  revocation invalidates the token immediately (E2E-asserted).
- Session restore calls `/api/auth/me` — localStorage alone is never trusted.
- *Not implemented:* SMS verification codes (no SMS provider configured) and
  "remembered devices" UI polish — see §22.

## 8. Socket.IO changes
- `io.use()` verifies the JWT **and** the session row at handshake; identity is
  server-derived (`socket.data.user`) — client userId is never trusted.
- Events: `room:join` (by code, membership-checked, reconnect-safe),
  `room:leave`, `game:roll`, `game:move` — all ack `{ok,error}` with friendly
  errors; per-socket event rate limiting.
- Server emits `room:state`, `game:started`, `game:state`, `game:ended`,
  `room:closed`, `room:notice`.
- Reconnection: client auto-reconnects and re-joins; authoritative state is
  served from memory **or** persisted `Game.state` (server restart recovery);
  disconnect marks the seat offline without corrupting state.
- Turn timeout (45 s) auto-plays a **server-chosen legal** move so a dead
  connection cannot stall the game.
- Silent logging replaced with `logger` (leveled, redacted, never sent to
  clients).

## 9-10. WebRTC / TURN changes
None — this codebase has **no calling feature** (no RTCPeerConnection, no ICE,
no signalling, no STUN/TURN config anywhere). Per the "no fake implementations /
no false claims" rules the UI contains no call controls and no encryption or
TURN claims, so nothing to repair or remove. Implementing calls requires new
signalling endpoints + TURN credentials from a provider (see §22) — I did not
ship a pretend WebRTC layer.

## 11. Kenyan phone validation changes
New shared module (`shared/validation.js`, same rules on both tiers):
- Accepts `0712345678`, `+254712345678`, `254712345678` (plus `01x` new-series),
  tolerates spaces/dashes; normalizes to canonical `+254…`.
- Rejects non-mobile (fixed lines `02x…`), short/long numbers, junk.
- Registration validates on the **server** (frontend validation is UX only);
  duplicates produce a field-level 409. Unit-tested for acceptance/rejection.

## 12. Chat changes
Absent subsystem — no chat code existed; not fabricated. (Required: message
tables/rooms, socket events, media; see §22.)

## 13. Updates/Status changes
Absent subsystem — no status code existed; not fabricated.

## 14. Ludo changes
- **Server-authoritative engine** (`shared/ludo.js`, unit-tested): turn order
  2-4 players, leaving home requires 6, legal move computation, own-token
  blocking, captures on non-safe ring cells, exact finish (overshoot illegal),
  extra turn on 6, win detection. Dice are generated on the server
  (`crypto.randomInt`); a `move-token` payload can only pick a token the engine
  marked legal; client `winner/dice/gameState` values are never trusted.
- Persistent `Game`/`Move` rows; winner + finish recorded; history endpoint.
- Room stability: seats = DB memberships; in-memory authoritative state;
  disconnect/reconnect + server restart continuity via persisted state; turn
  timeout auto-play; auto-start when the room fills or host starts (≥2).

## 15. Bet Game changes
No Bet Game existed (the spec's "Points→Bet Game" rename does not appear in
this codebase). The **Bet room-code format** (`^\d{3}[A-Z]{4}$`, uppercased)
is implemented and unit-tested in the shared validator for future use, and
creating a `bet` room returns an explicit `BET_UNAVAILABLE` error rather than
pretending. No KSh/pot/payment code was fabricated.

## 16. Payment changes
None possible — M-PESA (Daraja) requires merchant credentials & callbacks that
are not configured anywhere in this project (see §22). Backend refuses bet-room
creation with a clear message instead of simulating payments.

## 17. Security changes
- Socket + REST identity from verified server sessions only; IDOR-guarded
  device revocation; membership re-checks on every game event; room-code
  guessing mitigated by 6-digit space + auth + rate limits (a wrong code is a
  404, never a data leak).
- Input validation server-side everywhere (register fields, join codes,
  socket payloads incl. `tokenIndex` bounds); Prisma errors mapped, never leaked.
- CORS allow-list (no wildcard), security headers, JSON body limit,
  rate limits (auth 30/15 min, API 600/15 min, per-socket 40/10 s).
- Secrets: `.env`/`.env.local` untracked; `.env.example` committed; only
  `NEXT_PUBLIC_*` (non-secret) reach the browser; placeholder-secret warning +
  production startup refusal when env missing. XSS surface minimized (React
  text rendering only, no `dangerouslySetInnerHTML`).
- CSRF: bearer-token auth (no ambient cookies) → CSRF not applicable; note:
  cookies are not used for sessions.

## 18. Media upload changes
No media/upload code exists (`/api/media/*` absent) → nothing to secure or fake.
When added, the spec's rules (auth, size/MIME limits, safe names, temp cleanup)
should be applied — flagged as required design in §22.

## 19. UI changes
Preserved the existing dark navy/gold Ludo identity; repaired what was broken:
- Auth screen (login/register with live field errors, phone support) and lobby
  (create with 2/3/4 players, join by code with validation).
- Room page: 6-digit code header + **Clipboard API copy with fallback**
  ("Copied" only after confirmed success), waiting-room seats with host/online
  status, host start button, leave.
- Board rebuilt as a responsive SVG board rendering **authoritative** state:
  tokens, legal-move highlights (pulse), server dice with animation, turn/status
  banners, connection indicator, winner overlay. Stub/placeholder JSX removed.
- Removed two unused local-random dice implementations (server dice are now the
  single source of truth). Removed the misleading mute control (no audio
  exists); theme/3D controls that do nothing were not carried over.

## 20. Production build result
`npm run build` → **success** (Next.js 14.0.4):
- ✓ compiled, lint/type-check clean, static `/` + dynamic `/room/[code]`
  (SSR, λ) — Vercel-compatible out of the box
- ✓ no missing imports / broken routes (previous build failed on `useAuth`)
- ✓ unit tests: 23/23 pass (`npm test`)
- Runtime smoke (server without DB): health reports `db:"down"`; DB routes →
  friendly `503 DB_UNAVAILABLE`; validation errors → field-level 400 before DB;
  unauth → 401; unknown route → JSON 404; bad JSON → 400.

## 21. End-to-end test results
- **What ran here:** pure engine/validation/geometry tests; Next production
  build; backend boot smoke tests (above). Socket auto-play path verified by
  code trace; per-socket listener duplication eliminated by construction
  (single registration + `removeAllListeners` cleanup).
- **Full E2E (`tests/e2e.mjs`) requires a live PostgreSQL** — this sandbox has
  no Postgres and blocks spawning one (embedded-postgres binary refused by the
  runtime sandbox). The harness is committed and covers: register (2 users,
  canonical phone) → duplicate 409 → bad-login 401 → login → `/me` restore →
  401 without token → devices (revoke other user 403; revoke own device →
  token invalidated) → create/join room (6-digit code; duplicate join 409;
  invalid code 400) → host start (non-host 403) → two authenticated sockets →
  full game played through the active player's socket until a winner →
  history recorded.
  Run it with: `docker compose up -d && npx prisma migrate deploy && node tests/e2e.mjs`.

## 22. Remaining limitations (exact reasons)
1. **No live-DB E2E executed here** — sandbox lacks PostgreSQL and cannot
   execute the embedded Postgres binary. Fix: run `tests/e2e.mjs` against any
   Postgres (compose file provided).
2. **Chat / Calls / Status / Media / Contacts / Blocking** — absent from the
   repo. Adding them is new product work (not repair); each needs schema,
   REST+socket surface and (for calls) signalling + TURN credentials. Not
   faked.
3. **WebRTC/TURN** — no calling code exists; a real implementation needs TURN
   credentials (e.g., Twilio/Cloudflare) served from the backend — never
   hard-coded client-side.
4. **M-PESA / Bet mode / payments** — requires a Daraja app (consumer
   key/secret, passkey, shortcode, callback URL) configured server-side plus a
   Payment/Session model; the 5-minute window, KSh pot and payout rules must be
   enforced by a backend that verifies Daraja callbacks. Frontend must never
   collect M-PESA PINs. Not faked; bet-room creation currently returns
   `BET_UNAVAILABLE`.
5. **SMS verification** — needs an SMS provider (Africa's Talking, Twilio…).
   Registration currently uses email/username + optional phone; phone verify
   flow not present.
6. **Authoritative game scale-out** — game state lives in one process's memory
   (+ persisted snapshots). Multi-instance deployment needs a shared store
   (Redis/Postgres-locked actor); documented for the current single-instance
   backend host.
7. **Board rendering** — the board is a clean modern SVG loop rather than a
   pixel-classic 15×15 print; engine semantics are untouched by visuals.
8. **Dark-mode toggle / speaker control / E2E claims** — none exist in this
   UI; no misleading controls or security claims were shipped.

## 23. Required environment variables / configuration
See `.env.example` and README table: `DATABASE_URL`, `JWT_SECRET`,
`FRONTEND_URL`, `PORT`, `NEXT_PUBLIC_BACKEND_URL`, `LOG_LEVEL`, `TRUST_PROXY`.
Vercel: set `NEXT_PUBLIC_BACKEND_URL`. Backend host additionally needs the
Postgres migration applied (`npx prisma migrate deploy`).
