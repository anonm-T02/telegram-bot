# API

## Public

```
GET /health
```

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
