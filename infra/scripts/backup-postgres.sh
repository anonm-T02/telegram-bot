#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/nova-org-postgres}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/nova_org_backup_${TIMESTAMP}.sql.gz"
CONTAINER_NAME="nova-org-prod-postgres-1"

mkdir -p "${BACKUP_DIR}"

echo "--> Starting PostgreSQL backup at $(date)..."
if docker exec -t "${CONTAINER_NAME}" pg_dump -U nova nova_org | gzip > "${BACKUP_FILE}"; then
    echo "[SUCCESS] Backup created successfully: ${BACKUP_FILE}"
    echo "Size: $(du -h "${BACKUP_FILE}" | cut -f1)"
else
    echo "[ERROR] Backup failed!"
    exit 1
fi

# Clean up backups older than 30 days
echo "--> Cleaning up backups older than 30 days..."
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +30 -delete
echo "--> Backup process finished."
