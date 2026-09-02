# NOX / Darknote-web1 — Technical Audit (pre-repair baseline)

Audit date: 2026-09-02. Repo: `alsphalt/Darknote-web1` (branch `main`, 1 commit).
App identity inside the repo: **"Ludo"** (package `ludo-frontend`, Next.js 14.0.4 + React 18 + Express + Socket.IO + Prisma/PostgreSQL).
**No NOX.html exists in this repo.** The requested NOX subsystems (chat, calls/WebRTC, status/updates, M-PESA payments, bet-game, media, TURN) are **absent**; see "Scope mapping" at the end.

## Architecture (as-is)
- Frontend: `app/` (App Router) + `components/` + `contexts/SocketContext.Js` + `hooks/useLudoGame.js`. Dark 15×15 Ludo visual identity via CSS modules + inline styles.
- Backend: `src/index.js` Express + Socket.IO server on :5000, `src/routes/*`, `src/socket/*`, Prisma schema `prisma/schema.prisma` (User/Room/RoomUser/Game/Move).
- Deployment: no config; frontend env `NEXT_PUBLIC_BACKEND_URL=http://localhost:5000`; `.env` and `.env.local` are **committed to git** (both contain only placeholders, but they must not be tracked).

## Build blockers (app cannot build/run today)
1. `app/room/[code]/page.js` imports `@/hooks/useAuth` — **file does not exist** → Next build fails.
2. `contexts/SocketContext.Js` filename has uppercase `.Js` extension; imports use `@/contexts/SocketContext` → resolution failure on case-sensitive filesystems.
3. `components/Board.js` is a **stub**: real cell/token rendering replaced by `{/* ... comments ... */}`; imports `useSocket` and crashes on the home page where no `SocketProvider` exists (context throws).
4. `app/page.js` renders `<Board/>` with no `SocketProvider` → runtime crash on first paint.
5. `package.json` has **no backend dependencies** (express, socket.io, @prisma/client, bcryptjs, jsonwebtoken, cors, dotenv all missing) and no `"type":"module"`, so `node src/index.js` cannot run.
6. Winner check bug: `gameState?.winner !== null` is true when `winner` is `undefined` → "undefined wins!" banner logic.
7. Home page shows Board even when no room is joined (no game/room wiring at all).

## API / backend bugs
8. Only two endpoints exist: `POST /api/auth/register`, `POST /api/auth/login`. Everything else referenced by the spec (`/api/auth/verify`, `/me`, `/devices/revoke`, users/blocked, status, games/points|history|rooms, media, chats, calls, contacts) **does not exist**.
9. Register: no input validation (empty/invalid username, email, short password accepted or crashes), all errors (incl. DB-down) collapse into `400 "User already exists"`, duplicate-field info lost, no phone support, password hashing OK (bcrypt 10).
10. Login: only by `username` (no email), generic 401, no rate limiting, no device/session records, no expiry (`jwt.sign` with no `expiresIn`).
11. JWT secret placeholder `your_super_secret_key` shipped in committed `.env`; no secret rotation guidance.
12. Room code generator `crypto.randomBytes(3).toString('hex')` produces **6 hex chars (0-9 A-F)** — violates the required pure-6-digit numeric format and is ambiguous/case-insensitive-unsafe.
13. Rooms: no duplicate-join guard (same user can join twice), no code validation on join, GET route keys on Prisma `id` while UI/URL uses `code`, no leave/start endpoints, no game record linkage on finish.
14. Socket `join-room` trusts client-supplied `userId` + `token` without verification (comment admits it); any client can impersonate any user.
15. Socket emits `roll-dice`/`move-token` with **zero membership/turn verification beyond unauthenticated ids**; `applyMove` and `saveMove` are **called but never defined** → runtime crash on first move attempt.
16. Socket state map keyed by raw client `roomId` which is actually the room `code` in the UI → DB lookup by `id` misses; room never found, no state.
17. No socket reconnection/auth middleware; `socket.userId` lost across reconnects; disconnect does nothing (no offline marking, no state protection).
18. Dice/winner/moves: any client can trigger; no server-side legality validation; dice generated server-side but only gated on spoofable `socket.userId`.

## Game-engine issues (frontend hook `useLudoGame.js`)
19. Client rolls dice locally (`Math.random`) — in multiplayer the client decides values; server must be authoritative.
20. Rules gaps: no handling when dice=6 gives extra turn is implemented on the *move* side but move legality for leaving home requires exactly 6 (OK); exact-finish enforced but overshoot simply "cannot happen" — brittle; finished-token counting uses mutable object mutation inside setState; no capture when moving onto own token; no block rules; no 2/3-player support (fixed 4 colors).
21. Reconnection/continuity absent: fresh page load loses everything (no persistence hook into DB `Game.state`).

## Frontend/integration issues
22. No centralized API config: `http://localhost:5000` inline in SocketContext only; **no REST client exists at all**; no error mapping/friendly messages; no timeout handling.
23. No auth UI, no session restore (`localStorage` alone would be used — nothing persists tokens), no logout.
24. No clipboard helper; no copy-code affordance.
25. `Dice.js` and `Dice3D.js` are two dice implementations with **local random rolls** and no link to authoritative server dice; unused imports in Board (Dice unused; `useLudoGame` unused everywhere).
26. No reconnect UX, no "server offline" handling, no visible status of connection.

## Security
27. CORS wide open (`app.use(cors())`); Socket CORS only allows a single origin but no credentials logic.
28. No rate limiting, no request-size limit, no security headers (helmet/CSP), no JSON error handler → stack traces may leak in dev.
29. No input validation anywhere server-side (register fields, join code, socket payloads).
30. Client data trusted: userId (socket), winner, tokenIndex, room codes; Prisma errors swallowed into misleading generic messages (leaks "already exists" only).
31. `.env`/`.env.local` tracked in git; no `.env.example`.
32. No claims of E2E/TURN in this repo — nothing to remove, but nothing implemented either; the spec's "TURN auto-config" claim is not present here.

## UI/design notes to preserve
33. Dark navy `#1a1a2e` theme, gold title, 15×15 CSS-module board (`Board.module.css`: classic/wooden/neon themes, 3D tilt mode), colored tokens/home bases, draggable 3D CSS dice (`Dice3D`), CSS `body` centers content. Keep this identity.

## Scope mapping vs. the NOX repair spec
| Spec area | Present in this repo? | Action |
|---|---|---|
| Auth (register/login/me/logout/sessions/devices) | partial (register/login only) | repair + complete |
| Ludo room codes (6-digit normal / 3+4 bet) | partial (hex generator) | repair normal; bet-code validation added to shared lib for future bet mode |
| Server-authoritative Ludo engine | no (client hook + stub socket) | implement shared engine, server-authoritative |
| Rooms join/leave/start/reconnect | partial | repair |
| Central API config + REST client | no | add |
| Socket auth/events/logging/reconnect | no | rebuild |
| Kenyan phone validation | no | add shared rule (register optional phone) |
| Clipboard | no | add |
| Vercel readiness | no | add config + docs |
| Chat, Calls/WebRTC, TURN, Status/Updates, Media, M-PESA/bet/payments, dark-mode switch, speaker control | **absent — no code exists** | cannot "repair"; reported as gaps (do not fake) |
