# Production deployment and recovery

This runbook covers a single Ubuntu VPS using Docker Compose. Production must
use a separate Compose override with images, secrets, health checks, persistent
volumes, and no public Postgres or Redis ports. Never copy development values
from `.env.example` into production.

## Inputs required from the operator

- VPS address and an unprivileged sudo-capable deploy user
- DNS names for Mini App, API, and admin panel
- TLS certificate method and renewal owner
- absolute production Compose file path and approved immutable image digests
- Telegram token and generated application secrets in a root-readable env file
- Postgres database/user names and a dedicated absolute backup directory
- backup retention, encrypted off-host storage, monitoring, and maintenance window

Secrets must not appear in Git, shell history, cron lines, image layers, or
logs. Restrict the production env file and backup directory to mode `0600` and
`0700`. Allow inbound SSH, HTTP, and HTTPS only; restrict admin access further.

## Deployment

1. Confirm DNS, firewall, disk space, Docker/Compose versions, TLS, and an
   independently tested recent backup.
2. Pull approved immutable images and validate the merged Compose configuration.
3. In a maintenance window, run migrations as a one-off container, then start
   services with the approved Compose project.
4. Run `infra/scripts/health-check.sh`. Verify Telegram login, one idempotent
   click, admin authentication, and audit logging.
5. Retain the previous image digest until the observation window ends.

Required health-check environment:

```text
COMPOSE_FILE=/srv/nova/compose.production.yml
POSTGRES_SERVICE=postgres
REDIS_SERVICE=redis
DB_USER=<production database user>
DB_NAME=<production database name>
API_HEALTH_URL=https://api.example.com/api/health
APP_HEALTH_URL=https://app.example.com/
ADMIN_HEALTH_URL=https://admin.example.com/
```

## Backups and retention

`backup-postgres.sh` writes a compressed custom-format archive, validates its
catalog, generates a SHA-256 checksum, and deletes only matching expired files
inside the dedicated directory. Also copy it to encrypted off-host storage.

Use a root-readable environment file such as `/etc/nova/backup.env`:

```text
COMPOSE_FILE=/srv/nova/compose.production.yml
POSTGRES_SERVICE=postgres
DB_USER=<production database user>
DB_NAME=<production database name>
BACKUP_DIR=/srv/nova-backups/postgres
RETENTION_DAYS=14
```

Example root crontab entry (the env file must contain shell-safe values):

```cron
17 2 * * * set -a; . /etc/nova/backup.env; set +a; /srv/nova/infra/scripts/backup-postgres.sh >>/var/log/nova-backup.log 2>&1
```

Alert on missed jobs and low disk space. Test restoration into an isolated
database monthly; checksum verification alone does not prove recovery.

## Restore

Restore is destructive to the target database. Stop public traffic, confirm the
target twice, retain a pre-restore backup, and prefer an isolated database first.

```text
COMPOSE_FILE=/srv/nova/compose.production.yml
POSTGRES_SERVICE=postgres
DB_USER=<production database user>
DB_NAME=<confirmed target database>
BACKUP_DIR=/srv/nova-backups/postgres
RESTORE_FILE=/srv/nova-backups/postgres/nova_org_YYYYMMDDTHHMMSSZ.dump
RESTORE_CONFIRM=RESTORE_NOVA_ORG
```

Export these values and run `infra/scripts/restore-postgres.sh`. Afterwards,
apply matching migrations, run health checks and smoke tests, inspect logs, and
only then reopen traffic.

## Rollback

On failure, stop traffic and preserve logs. Roll back to the previous immutable
image only when its schema is forward-compatible. Never automatically reverse a
database migration. Otherwise use the reviewed restore procedure and pre-deploy
backup. Record image digests, migration version, and recovery decisions.
