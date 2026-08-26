#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:?COMPOSE_FILE must be an absolute path}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
DB_USER="${DB_USER:?DB_USER is required}"
DB_NAME="${DB_NAME:?DB_NAME is required}"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR must be an absolute, dedicated directory}"
RESTORE_FILE="${RESTORE_FILE:?RESTORE_FILE must identify one backup archive}"
RESTORE_CONFIRM="${RESTORE_CONFIRM:-}"

[[ "$COMPOSE_FILE" = /* ]] || { echo "COMPOSE_FILE must be absolute" >&2; exit 2; }
case "$BACKUP_DIR" in /|/home|/root|/var|/srv|/opt|/usr|/etc) echo "Refusing broad BACKUP_DIR" >&2; exit 2;; /*) ;; *) echo "BACKUP_DIR must be absolute" >&2; exit 2;; esac
[[ "$RESTORE_CONFIRM" == "RESTORE_NOVA_ORG" ]] || { echo "Restore refused. Set RESTORE_CONFIRM=RESTORE_NOVA_ORG after reviewing the target." >&2; exit 3; }

backup_root="$(realpath -e -- "$BACKUP_DIR")"
restore_path="$(realpath -e -- "$RESTORE_FILE")"
case "$restore_path" in "$backup_root"/nova_org_????????T??????Z.dump) ;; *) echo "RESTORE_FILE is not a recognized archive inside BACKUP_DIR" >&2; exit 2;; esac
[[ -f "${restore_path}.sha256" ]] || { echo "Checksum file is missing" >&2; exit 1; }
(cd "$backup_root" && sha256sum --check --status "$(basename -- "${restore_path}.sha256")") || { echo "Checksum verification failed" >&2; exit 1; }
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" pg_restore --list < "$restore_path" > /dev/null

echo "Restoring $restore_path into database $DB_NAME on service $POSTGRES_SERVICE"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_restore --username="$DB_USER" --dbname="$DB_NAME" --clean --if-exists \
  --no-owner --no-privileges --exit-on-error < "$restore_path"
echo "Restore completed. Run migrations and the health check before reopening traffic."
