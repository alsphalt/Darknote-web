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

### Backend → a long-running host (Railway / Render / Fly / a VPS)
Socket.IO needs persistent connections, so the API **cannot** run on Vercel
serverless functions. Deploy `src/` as a Node service:
```bash
npm install && npx prisma migrate deploy && npm run dev:server   # or use your host's start command
```
Set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` (include your Vercel domain,
e.g. `https://ludo-app.vercel.app`), `TRUST_PROXY=true` behind a proxy.

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
