#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:?COMPOSE_FILE must be an absolute path}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
REDIS_SERVICE="${REDIS_SERVICE:-redis}"
DB_USER="${DB_USER:?DB_USER is required}"
DB_NAME="${DB_NAME:?DB_NAME is required}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-10}"

[[ "$COMPOSE_FILE" = /* ]] || { echo "COMPOSE_FILE must be absolute" >&2; exit 2; }
[[ "$HEALTH_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || { echo "Invalid timeout" >&2; exit 2; }
docker compose -f "$COMPOSE_FILE" config --quiet
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" pg_isready --username="$DB_USER" --dbname="$DB_NAME"
[[ "$(docker compose -f "$COMPOSE_FILE" exec -T "$REDIS_SERVICE" redis-cli ping | tr -d '\r')" == "PONG" ]]

checked=0
for url in "${API_HEALTH_URL:-}" "${APP_HEALTH_URL:-}" "${ADMIN_HEALTH_URL:-}"; do
  [[ -n "$url" ]] || continue
  case "$url" in https://*) ;; *) echo "Health URL must use HTTPS: $url" >&2; exit 2;; esac
  curl --fail --silent --show-error --location --max-time "$HEALTH_TIMEOUT_SECONDS" --output /dev/null "$url"
  checked=$((checked + 1))
done
echo "Health check passed (Postgres, Redis, $checked HTTPS endpoint(s))."
