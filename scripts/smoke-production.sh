#!/usr/bin/env bash
set -euo pipefail

# Run the checked-in production Compose configuration against disposable data.
# No project .env file, application database, or fixed host port is used.
task_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
task_dir=$(mktemp -d "${TMPDIR:-/tmp}/lotterylunch-production.XXXXXXXX")
task_project="lotterylunch-smoke-$$-${RANDOM}"
task_compose=(docker compose --env-file /dev/null --project-name "$task_project"
  --project-directory "$task_root" -f "$task_root/docker-compose.prod.yml"
  -f "$task_dir/compose.yml")

export DATABASE_URL='postgresql://smoke:smoke-only-password@db:5432/smoke'
export BETTER_AUTH_URL='http://localhost:3000'
export BETTER_AUTH_SECRET='smoke-only-placeholder-at-least-32-characters'
export GOOGLE_CLIENT_ID='smoke-only-client-id'
export GOOGLE_CLIENT_SECRET='smoke-only-client-secret'

cleanup() {
  task_status=$?
  trap - EXIT
  if ((task_status != 0)); then
    "${task_compose[@]}" logs --no-color --tail 100 >&2 || true
  fi
  "${task_compose[@]}" down --volumes --rmi local --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$task_dir"
  exit "$task_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cat >"$task_dir/compose.yml" <<'YAML'
services:
  db:
    image: postgres:18
    environment:
      POSTGRES_USER: smoke
      POSTGRES_PASSWORD: smoke-only-password
      POSTGRES_DB: smoke
    tmpfs:
      - /var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U smoke -d smoke']
      interval: 2s
      timeout: 5s
      retries: 30
  migrate:
    depends_on:
      db:
        condition: service_healthy
  app:
    ports: !override
      - '127.0.0.1::3000'
    restart: 'no'
    healthcheck:
      interval: 2s
      start_period: 5s
      retries: 30
YAML

echo 'Building and starting the production image with an isolated PostgreSQL database...'
"${task_compose[@]}" up --build --detach --wait --wait-timeout 120

task_container=$("${task_compose[@]}" ps --quiet app)
task_user=$(docker inspect --format '{{.Config.User}}' "$task_container")
if [[ "$task_user" != node ]]; then
  echo "Expected the production server to run as node, got: $task_user" >&2
  exit 1
fi
task_binding=$("${task_compose[@]}" port app 3000)
if [[ ! "$task_binding" =~ ^127\.0\.0\.1:[0-9]+$ ]]; then
  echo "Expected a randomly assigned localhost port, got: $task_binding" >&2
  exit 1
fi

# Fetch from inside the image so this script needs Docker and Bash only.
"${task_compose[@]}" exec --no-TTY app node --input-type=module <<'JS'
import assert from 'node:assert/strict';
for (const [pathname, expected] of [['/', 200], ['/api/v1/health', 200], ['/api/v1/ready', 200]]) {
  const response = await fetch(`http://127.0.0.1:3000${pathname}`);
  assert.equal(response.status, expected, pathname);
  if (pathname === '/') {
    const html = await response.text();
    assert.match(html, /LotteryLunch/);
    const asset = html.match(/src="([^"]+\.js[^"]*)"/);
    assert.ok(asset, 'The production page references a JavaScript asset');
    const assetResponse = await fetch(new URL(asset[1], 'http://127.0.0.1:3000'));
    assert.equal(assetResponse.status, 200, 'Standalone server serves static assets');
  } else {
    const body = await response.json();
    assert.equal(body.status, pathname.endsWith('/ready') ? 'ready' : 'ok');
  }
}
console.log('Production server, static assets, liveness, and readiness passed.');
JS

echo 'Rehearsing a custom-format PostgreSQL backup and restore...'
"${task_compose[@]}" exec --no-TTY db psql --username smoke --dbname smoke --set ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "User" (id, email, name, "updatedAt")
VALUES ('smoke-owner', 'owner@smoke.invalid', 'Backup smoke owner', now());
INSERT INTO "Group" (id, name, "ownerId", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Backup smoke group', 'smoke-owner', now());
INSERT INTO "Membership" (id, "userId", "groupId", role, "groupRole", participating, "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000002', 'smoke-owner',
        '00000000-0000-4000-8000-000000000001', 'owner', 'owner', true, now());
SQL
"${task_compose[@]}" exec --no-TTY db pg_dump --username smoke --dbname smoke \
  --format custom --no-owner --no-acl >"$task_dir/backup.dump"
"${task_compose[@]}" exec --no-TTY db createdb --username smoke smoke_restored
"${task_compose[@]}" exec --no-TTY db pg_restore --username smoke --dbname smoke_restored \
  --exit-on-error --no-owner --no-acl <"$task_dir/backup.dump"

task_snapshot_sql='SELECT json_build_object(
  '\''users'\'', (SELECT json_agg(t ORDER BY id) FROM "User" t),
  '\''groups'\'', (SELECT json_agg(t ORDER BY id) FROM "Group" t),
  '\''memberships'\'', (SELECT json_agg(t ORDER BY id) FROM "Membership" t),
  '\''migrations'\'', (SELECT json_agg(t ORDER BY migration_name) FROM "_prisma_migrations" t)
);'
task_original=$("${task_compose[@]}" exec --no-TTY db psql --username smoke --dbname smoke \
  --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$task_snapshot_sql")
task_restored=$("${task_compose[@]}" exec --no-TTY db psql --username smoke --dbname smoke_restored \
  --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$task_snapshot_sql")
if [[ "$task_original" != "$task_restored" ]]; then
  echo 'Restored users, groups, memberships, or migration records differ from the backup source.' >&2
  exit 1
fi
echo 'Backup restore preserved user and group data, memberships, and migration history.'

# Recreate the same production app against the restored database and exercise its schema.
export DATABASE_URL='postgresql://smoke:smoke-only-password@db:5432/smoke_restored'
"${task_compose[@]}" up --detach --wait --wait-timeout 120 app

echo 'Checking readiness when PostgreSQL is stopped...'
"${task_compose[@]}" stop db
"${task_compose[@]}" exec --no-TTY app node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const ready = await fetch('http://127.0.0.1:3000/api/v1/ready', { signal: AbortSignal.timeout(30_000) });
assert.equal(ready.status, 503);
assert.equal((await ready.json()).status, 'unavailable');
const alive = await fetch('http://127.0.0.1:3000/api/v1/health');
assert.equal(alive.status, 200);
console.log('Database outage returns readiness 503 while process liveness stays 200.');
JS
echo 'Production container and backup/restore smoke checks passed.'
