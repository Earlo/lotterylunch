#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -z "${DATABASE_URL:-}" ] || [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  if [ -f .env.local ]; then
    set -a
    . ./.env.local
    set +a
  elif [ -f .env ]; then
    set -a
    . ./.env
    set +a
  fi
fi

if [ -z "${DATABASE_URL:-}" ] || [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  echo "DATABASE_URL and SHADOW_DATABASE_URL must be set (env or .env.local/.env)." >&2
  exit 1
fi

PRISMA_OUTPUT=""
PRISMA_STATUS=0

run_prisma_command() {
  set +e
  PRISMA_OUTPUT="$("$@" 2>&1)"
  PRISMA_STATUS=$?
  set -e
  printf '%s\n' "$PRISMA_OUTPUT"
}

retry_if_p1001() {
  if [ "$PRISMA_STATUS" -eq 0 ]; then
    return 1
  fi

  if ! printf '%s' "$PRISMA_OUTPUT" | grep -q 'P1001'; then
    return 1
  fi

  if [ -f /.dockerenv ]; then
    return 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  if [ ! -f docker-compose.yml ]; then
    return 1
  fi

  echo "P1001 detected: starting local db with docker compose."
  docker compose -f docker-compose.yml up -d db

  retries=30
  while [ "$retries" -gt 0 ]; do
    sleep 1
    run_prisma_command "$@"
    if [ "$PRISMA_STATUS" -eq 0 ]; then
      return 0
    fi
    if ! printf '%s' "$PRISMA_OUTPUT" | grep -q 'P1001'; then
      return 1
    fi
    retries=$((retries - 1))
  done

  return 1
}

if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  npm install
fi

npx prisma generate

if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  run_prisma_command npx prisma migrate deploy
  if [ "$PRISMA_STATUS" -ne 0 ]; then
    if retry_if_p1001 npx prisma migrate deploy; then
      :
    elif printf '%s' "$PRISMA_OUTPUT" | grep -q 'P3005'; then
      echo "P3005 detected: baselining existing local schema to current migrations."
      for migration_dir in prisma/migrations/*; do
        if [ -d "$migration_dir" ]; then
          migration_name="$(basename "$migration_dir")"
          npx prisma migrate resolve --applied "$migration_name" >/dev/null 2>&1 || true
        fi
      done

      run_prisma_command npx prisma db push
      if [ "$PRISMA_STATUS" -ne 0 ]; then
        if retry_if_p1001 npx prisma db push; then
          :
        else
          exit "$PRISMA_STATUS"
        fi
      fi

      run_prisma_command npx prisma migrate deploy
      if [ "$PRISMA_STATUS" -ne 0 ]; then
        if retry_if_p1001 npx prisma migrate deploy; then
          :
        else
          exit "$PRISMA_STATUS"
        fi
      fi
    else
      exit "$PRISMA_STATUS"
    fi
  fi
else
  run_prisma_command npx prisma db push
  if [ "$PRISMA_STATUS" -ne 0 ]; then
    if retry_if_p1001 npx prisma db push; then
      :
    else
      exit "$PRISMA_STATUS"
    fi
  fi
fi

npm run dev:app
