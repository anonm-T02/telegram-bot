# Privacy and account deletion

NOVA ORG stores the Telegram identity fields needed to operate an account,
authentication and activity-session records, referral relationships, and
server-side audit/economy records. Secrets and raw bearer tokens are not stored;
session tokens are represented by one-way hashes in the database.

## Account deletion requests

An authenticated user can submit `POST /me/deletion-request`. Submission creates
an auditable, idempotent request in `PENDING` state. It does **not** immediately
hard-delete the account. This protects ledger integrity and allows the operator
to apply retention, fraud, dispute, and legal requirements before completing an
approved deletion workflow.

Submitting the endpoint again while a pending request exists returns the same
request instead of creating duplicates. The optional reason is limited to 500
characters and must not contain secrets.

The completion workflow, retention period, export process, and operator contact
must be finalized before production launch. Completion should revoke active
sessions, minimize or anonymize eligible identity data, preserve records that
must be retained, and write an administrative audit event.
