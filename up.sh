#!/usr/bin/env sh
set -eu

LOCAL_UID="${LOCAL_UID:-$(id -u)}"
LOCAL_GID="${LOCAL_GID:-$(id -g)}"
export LOCAL_UID LOCAL_GID

exec docker compose -f docker-compose.yml up "$@"
