#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

# The lockfile makes container installs reproducible after dependency updates.
npm ci
npm run db:deploy

# Prisma config and Next.js load .env.local/.env without executing them as shell code.
# An existing untracked schema must be baselined explicitly after review.
exec npm run dev:app
