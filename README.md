# 🎲 Ludo — Multiplayer Ludo (Next.js + Express + Socket.IO + PostgreSQL)

A repaired, production-oriented multiplayer Ludo application: register/login with
server-side sessions, 6-digit room codes, and a **server-authoritative** game
engine (the server rolls the dice, validates every move, and broadcasts the
state — clients only render it).

> Repo note: this codebase (delivered as `Darknote-web1`) is the *Ludo* project.
> The separate NOX spec items (chat, calls/WebRTC, M-PESA, bet-mode, status,
> media) are **not part of this codebase** — see `docs/FINAL_REPORT.md`.

## Architecture

```
Browser (Next.js app router)
   │  REST (register/login/rooms)  +  Socket.IO (rooms + game events)
   ▼
Express API (:5000) ── Socket.IO server (authenticated handshake)
   │
Prisma ── PostgreSQL (users, sessions, rooms, games, moves)
```

- `app/`, `components/`, `contexts/`, `hooks/` — React frontend (dark Ludo UI)
- `lib/` — centralized API config (`NEXT_PUBLIC_BACKEND_URL`), REST client,
  clipboard & logging helpers
- `shared/` — pure logic used identically by server and client:
  validation (Kenyan phone, room-code formats), the authoritative Ludo engine,
  board geometry
- `src/` — Express backend: routes, JWT+session middleware, Socket.IO handlers,
  game service
- `prisma/` — schema + committed baseline migration
- `backend/` — self-contained Vercel deploy unit for the API (mirrors `src/`,
  `shared/`, `prisma/`, `.env.example`; regenerate with `npm run backend:sync`)
- `tests/e2e.mjs` — full end-to-end test (needs a real PostgreSQL)

## Quick start (local development)

1. **Database** (one of):
   ```bash
   docker compose up -d            # local Postgres (port 5432)
   ```
   or point `DATABASE_URL` at any PostgreSQL (Neon/Supabase/RDS…).
2. **Configure env** — copy and edit:
   ```bash
   cp .env.example .env          # backend: DATABASE_URL, JWT_SECRET, FRONTEND_URL, PORT
   cp .env.example .env.local    # frontend: NEXT_PUBLIC_BACKEND_URL
   ```
3. **Install + migrate**:
   ```bash
   npm install
   npx prisma migrate deploy     # applies prisma/migrations baseline
   ```
4. **Run** (two processes):
   ```bash
   npm run dev:server            # API + Socket.IO on :5000
   npm run dev                   # Next.js on :3000  → http://localhost:3000
   ```
5. **Verify**:
   ```bash
   npm test                      # engine/validation/layout unit tests
   node tests/e2e.mjs            # full REST+socket E2E against the real DB
   npm run build                 # production build
   ```

## Environment variables

| Variable | Used by | Required | Meaning |
|---|---|---|---|
| `DATABASE_URL` | backend | yes | PostgreSQL connection string |
| `JWT_SECRET` | backend | yes | JWT signing secret (`openssl rand -hex 32`) |
| `PORT` | backend | no | API port (default 5000) |
| `FRONTEND_URL` | backend | yes | comma-separated allowed browser origins (CORS + Socket.IO) |
| `NEXT_PUBLIC_BACKEND_URL` | frontend | no* | backend origin; empty = same-origin |
| `LOG_LEVEL` | backend | no | silent/error/warn/info/debug (default info; warn in prod) |
| `TRUST_PROXY` | backend | no | set `true` behind one reverse proxy hop |

\* `NEXT_PUBLIC_BACKEND_URL` is public (browser-visible) by design — it must
never hold secrets. `JWT_SECRET`/`DATABASE_URL` are server-only.

## Deployment

### Frontend → Vercel
- Import the repo, framework preset **Next.js**.
- Add environment variable `NEXT_PUBLIC_BACKEND_URL=https://your-api.example.com`
  (or leave empty when you later serve the API from the same domain).
- The room route `/room/[code]` is server-rendered on demand (works out of the
  box; no `export`/static-only config).

### Backend → a long-running host (Railway / Render / Fly / a VPS) — *preferred*
Socket.IO needs persistent connections, so the most reliable real-time setup
runs the API on a long-running Node host rather than Vercel serverless. Deploy
`src/` as a Node service:
```bash
npm install && npx prisma migrate deploy && npm run dev:server   # or use your host's start command
```
Set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` (include your Vercel domain,
e.g. `https://ludo-app.vercel.app`), `TRUST_PROXY=true` behind a proxy.

### Both on Vercel (backend + frontend) — *works since Vercel's WebSockets Beta*
Since 2026 Vercel Functions can serve WebSockets (Beta, all plans, requires
**Fluid compute** — the default for new projects created on/after Apr 23, 2025).
Express deploys zero-config. This repo is already adapted:

- Socket.IO is forced to **WebSocket-only transport** (server `src/index.js` +
  client `contexts/SocketContext.js`) — Vercel does not support Socket.IO HTTP
  long-polling.
- The backend default-exports its http server (`src/index.js`) so Vercel's
  zero-config Express detection can serve it.
- Authoritative game state is persisted to Postgres on **every** roll/move
  (`src/socket/socketHandlers.js`), so after a function instance recycles the
  client's auto-reconnect + re-join resumes the exact game state.

Runbook (one repo → **two Vercel projects**, monorepo):

1. Create a PostgreSQL (Neon/Supabase/…) and apply the migration once:
   ```bash
   cd backend && npx prisma migrate deploy   # uses backend/.env DATABASE_URL
   ```
2. **Backend project** → import this repo, **Root Directory:** `backend/`
   (Framework preset: Express — detected automatically).
   Environment variables: `DATABASE_URL`, `JWT_SECRET`,
   `FRONTEND_URL=https://<frontend-project>.vercel.app`, `TRUST_PROXY=true`.
   It deploys to e.g. `https://<backend-project>.vercel.app`.
3. **Frontend project** → import the same repo, **Root Directory:** `.`
   (Framework preset: Next.js). Environment variable:
   `NEXT_PUBLIC_BACKEND_URL=https://<backend-project>.vercel.app`.
4. After editing root `src/`, `shared/` or `prisma/`, re-sync the deploy unit:
   `npm run backend:sync` (see `scripts/sync-backend.sh`), then push.

Caveats (Beta + serverless realities, see `docs/FINAL_REPORT.md` §24):
- A WebSocket connection ends when its function instance reaches the max
  duration — clients auto-reconnect and re-join (already implemented).
- Sockets are pinned per function instance; in practice all players of one
  room land on the same warm instance, but this is **not guaranteed**. If your
  traffic ever spans instances you must add a Socket.IO Redis adapter plus a
  DB-locked game actor (out of scope; the `backend/` unit is otherwise
  instance-stateless thanks to per-event Postgres persistence).
- REST/HTTP requests are fully serverless-safe (rate-limit counters are
  per-instance and may reset).

**Login "404 / That was not found" fix:** this message is the app's friendly
error when the login API call returns HTTP 404 — i.e. the browser called a URL
with no backend behind it (typically `NEXT_PUBLIC_BACKEND_URL` empty →
same-origin `/api/*` on the frontend domain). Set `NEXT_PUBLIC_BACKEND_URL` to
the real backend URL (step 3 above) and redeploy the frontend.

### Same-domain (optional)
Proxy `/api` (and Socket.IO path) from the Next.js host to the Node backend —
then leave `NEXT_PUBLIC_BACKEND_URL` empty and everything is same-origin.

## Security model (what was fixed)

- JWT **+** server-side sessions: revocation & expiry are enforced per request;
  localStorage alone is never treated as authentication.
- Socket identity comes only from the verified handshake token; every game
  event re-checks room membership; dice/winner/moves are server-authoritative.
- Centralized error handling with friendly messages — no stack traces to
  clients; validation happens on the server (phone, room codes, inputs).
- CORS allow-list, rate limiting (auth + API + per-socket), bounded JSON body,
  security headers, `.env` files untracked (see `.env.example`).

## Known boundaries (not implemented here)

See `docs/FINAL_REPORT.md` §22 for the exact list — notably chat, WebRTC calls,
M-PESA/bet-mode payments, media uploads, and status/updates do not exist in
this codebase, and the report explains what configuration each would need.
