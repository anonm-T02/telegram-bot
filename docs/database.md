# Database

`packages/db` wires up a Prisma client pointed at `DATABASE_URL`. Phase 2
adds the coin-economy schema needed for the bot-only wallet surface:

- `User` — Telegram identity, unique `referralCode`, optional
  `referredById`.
- `Wallet` — one per user; `balance`, `totalEarned`, `totalSpent`.
- `CoinTransaction` — append-only ledger row for every balance change.
- `DailyClaim` — one row per `(userId, claimDate)`; the unique constraint
  is what makes `/internal/rewards/daily` idempotent.
- `Referral` — one row per referred user (`referredUserId` is unique, so
  a user can only be referred once); tracks the reward paid to the
  referrer.

Migrations live in `packages/db/prisma/migrations`. Apply them with:

```bash
npm run prisma:generate -w @nova-org/db
npm run prisma:deploy -w @nova-org/db
```

The full target schema (devices, contribution_sessions, work_units,
tasks, services, admin_logs, etc.) is specified in
`NOVA_ORG_AGENT_PLAN.md` section 9 and lands in later phases.
