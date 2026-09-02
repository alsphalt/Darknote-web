#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# sync-backend.sh — regenerate backend/ (the self-contained Vercel deploy unit)
# from the repo root.
#
# Why this exists: Vercel uploads ONLY the Root Directory of a project, so the
# backend project (Root Directory = backend/) cannot import files outside it.
# Edit code in the root src/ shared/ prisma/ — then run this script so
# backend/ mirrors those edits before you push/deploy.
#
#   npm run backend:sync        (or: bash scripts/sync-backend.sh)
#
# backend/package.json and backend/.gitignore are maintained directly and are
# NOT overwritten by this script.
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"

for dir in src shared prisma; do
  rm -rf "$BACKEND/$dir"
  cp -R "$ROOT/$dir" "$BACKEND/$dir"
done

rm -f "$BACKEND/.env.example"
cp "$ROOT/.env.example" "$BACKEND/.env.example"

echo "✓ backend/ synced from root (src/, shared/, prisma/, .env.example)."
echo "  backend/package.json + backend/.gitignore are managed manually."
