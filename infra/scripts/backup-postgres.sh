#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

COMPOSE_FILE="${COMPOSE_FILE:?COMPOSE_FILE must be an absolute path}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
DB_USER="${DB_USER:?DB_USER is required}"
DB_NAME="${DB_NAME:?DB_NAME is required}"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR must be an absolute, dedicated directory}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

case "$COMPOSE_FILE" in /*) ;; *) echo "COMPOSE_FILE must be absolute" >&2; exit 2;; esac
case "$BACKUP_DIR" in /|/home|/root|/var|/srv|/opt|/usr|/etc) echo "Refusing broad BACKUP_DIR: $BACKUP_DIR" >&2; exit 2;; /*) ;; *) echo "BACKUP_DIR must be absolute" >&2; exit 2;; esac
[[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || { echo "RETENTION_DAYS must be a positive integer" >&2; exit 2; }

install -d -m 0700 -- "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$BACKUP_DIR/nova_org_${timestamp}.dump"
partial="${archive}.partial"
cleanup() { rm -f -- "$partial"; }
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump --username="$DB_USER" --dbname="$DB_NAME" --format=custom --compress=9 > "$partial"
[[ -s "$partial" ]] || { echo "Backup is empty" >&2; exit 1; }
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" pg_restore --list < "$partial" > /dev/null
mv -- "$partial" "$archive"
sha256sum -- "$archive" > "${archive}.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'nova_org_????????T??????Z.dump' -o -name 'nova_org_????????T??????Z.dump.sha256' \) \
  -mtime "+$RETENTION_DAYS" -delete
echo "Verified backup created: $archive"
