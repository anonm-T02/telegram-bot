# Production operations scripts

These scripts target an Ubuntu host running Docker Compose. They do not contain
credentials. Configure them with environment variables or a root-readable
systemd/cron environment file; do not commit that file.

- `backup-postgres.sh` creates and verifies a compressed PostgreSQL archive,
  writes a SHA-256 checksum, and removes expired backups.
- `restore-postgres.sh` verifies and restores one archive only after explicit
  confirmation.
- `health-check.sh` checks Compose datastores and optional HTTPS endpoints.

See `docs/deployment.md` for required inputs and examples.
