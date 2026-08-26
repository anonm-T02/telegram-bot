# API

## Public

```
GET /health
```

## Authenticated account

These routes require `Authorization: Bearer <session-token>`. The token must be
valid and match a live, non-revoked database session.

```
GET  /me
POST /me/deletion-request    { reason? }
```

`GET /me` returns only minimal profile data and current session metadata. It
does not expose wallet or balance data. A deletion request is idempotent while
pending and creates a reviewable record; it never immediately hard-deletes the
account. See `docs/privacy.md` for the lifecycle and retention notes.

## Internal (bot-only)

Guarded by an `x-internal-secret` header that must match
`INTERNAL_API_SECRET`. Never called from the Mini App/browser — only from
the trusted Telegram bot process.

```
POST /internal/users/ensure       { telegramId, username?, firstName?, lastName?, languageCode?, referralCodeUsed? }
GET  /internal/wallet/:telegramId
POST /internal/rewards/daily      { telegramId }
GET  /internal/referral/:telegramId
```

All wallet-affecting mutations run inside a Prisma transaction; the daily
reward is idempotent per UTC day via a DB unique constraint, not
application-level locking alone.

The full public API surface (auth, contribution, work, tasks, services,
leaderboard) is defined in `NOVA_ORG_AGENT_PLAN.md` section 20 and will be
implemented in later phases.
