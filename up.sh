#!/usr/bin/env sh
set -eu

exec docker compose -f docker-compose.yml up "$@"
