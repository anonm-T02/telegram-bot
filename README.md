# NOVA ORG

Telegram Bot + Telegram Mini App + internal `NOVA Coin` (NVC) economy +
opt-in device contribution platform.

Full product/technical plan: [`NOVA_ORG_AGENT_PLAN.md`](./NOVA_ORG_AGENT_PLAN.md).

> **Status:** Integrated Phase 4 complete and running locally. Telegram
> auth/session/activity, server-authoritative clicks, referral milestones,
> fraud signals, and risk-gated rewards are implemented. All migrations are
> applied to the local PostgreSQL test database.

## Prerequisites

- Node.js >= 20
- Docker + Docker Compose (for PostgreSQL and Redis)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Setup

```bash
npm install
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN and other secrets in .env
```

## Start datastores

```bash
npm run docker:up
```

This starts PostgreSQL (`localhost:5432`) and Redis (`localhost:6379`).

> No Docker? You can point `DATABASE_URL` at any local PostgreSQL
> instance instead. `infra/scripts/setup-local-postgres.sql` creates the
> dedicated `nova`/`nova_org` role and database matching
> `.env.example` — run it once against your instance as a superuser.

## Apply the database schema

```bash
npm run prisma:generate -w @nova-org/db
npm run prisma:deploy -w @nova-org/db   # applies packages/db/prisma/migrations
```

## Run services (each in its own terminal)

```bash
npm run dev:api        # Fastify API      → http://localhost:4000/health
npm run dev:bot        # Telegram bot (long polling)
npm run dev:mini-app   # Mini App         → http://localhost:5173
npm run dev:admin      # Admin Panel      → http://localhost:5174
```

## Verify

```bash
npm run typecheck
npm run build
npm run lint
```

## Environment variables

See [`.env.example`](./.env.example). All variables are validated at
startup via `packages/config` (Zod) — the process fails fast with a clear
error if something required is missing.

| Variable                 | Description                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`     | Bot token from @BotFather                                                                         |
| `TELEGRAM_BOT_USERNAME`  | Bot username, e.g. `NovaOrgBot`                                                                   |
| `APP_URL`                | Mini App URL (used for the bot's WebApp button)                                                   |
| `API_URL`                | Backend API URL                                                                                   |
| `ADMIN_URL`              | Admin Panel URL                                                                                   |
| `DATABASE_URL`           | PostgreSQL connection string                                                                      |
| `REDIS_URL`              | Redis connection string                                                                           |
| `JWT_SECRET`             | Session/JWT signing secret                                                                        |
| `SESSION_SECRET`         | Session cookie secret                                                                             |
| `WORK_SIGNING_SECRET`    | Signing secret for compute work units                                                             |
| `INTERNAL_API_SECRET`    | Shared secret the bot uses to call the API's `/internal/*` routes (never exposed to the Mini App) |
| `DAILY_REWARD_AMOUNT`    | NVC granted per daily claim (default `50`)                                                        |
| `REFERRAL_REWARD_AMOUNT` | NVC granted to the referrer when their invite joins (default `500`)                               |
| `ADMIN_TELEGRAM_IDS`     | Comma-separated Telegram IDs with admin access                                                    |

Secrets are never committed — `.env` is gitignored.

## Project structure

```
apps/
  bot/        Telegram bot (grammY)
  api/        Backend API (Fastify)
  mini-app/   Telegram Mini App (React + Vite)
  admin/      Admin Panel (React + Vite)
packages/
  db/         Prisma client + schema
  shared/     Shared constants/types
  validation/ Zod schemas
  ui/         Shared UI components + design tokens
  config/     Environment loading/validation
workers/
  validator/       Work unit validation (Phase 3)
  server-worker/    Server-side compute worker (Phase 3)
infra/
  docker/     Docker Compose files
  nginx/      Reverse proxy config (Phase 5)
  scripts/    Deployment scripts (Phase 5)
docs/         Architecture, API, database, security docs
```

## What's complete

**Phase 1 — Foundation**

- Monorepo with npm workspaces, shared TypeScript config, ESLint, Prettier.
- Environment validation (Zod) shared across apps.
- Docker Compose for PostgreSQL + Redis.
- Fastify API skeleton with `/health`.
- Mini App skeleton (React + Vite + Telegram Mini Apps SDK bootstrap).
- Admin Panel skeleton (React + Vite).

**Phase 2 — Coin Economy (bot-only surface)**

- Prisma schema: `User`, `Wallet`, `CoinTransaction`, `DailyClaim`,
  `Referral`.
- API `/internal/*` routes, protected by a shared `INTERNAL_API_SECRET`
  header — only the bot process may call them:
  - `POST /internal/users/ensure` — upserts the user + wallet, links a
    referral on first creation.
  - `GET /internal/wallet/:telegramId` — balance/earned/spent.
  - `POST /internal/rewards/daily` — idempotent per UTC day (enforced by
    a DB unique constraint, safe under concurrent requests).
  - `GET /internal/referral/:telegramId` — referral code + stats.
- Telegram bot commands: `/start` (creates the account, parses the
  referral deep link), `/balance`, `/daily`, `/referral`, `/help`.
- The Mini App intentionally shows no coin/wallet data in this phase.

## What's complete (Integrated Phase 2)

- Telegram `initData` validation and ACTIVE-user authorization.
- Short-lived access tokens, rotating refresh tokens, and logout/revocation.
- Activity heartbeat with active/idle/background/offline states.
- One rewardable session per user and global stale-session expiry.
- Minimal `/me` and idempotent account deletion request.
- Auth lifecycle tests: 10 passing.

## What's complete (Integrated Phase 3)

- Server-authoritative click engine with a two-second cooldown.
- At most 1,000 confirmed clicks per UTC day.
- Integer microcoin ledger, request idempotency, and concurrent-click protection.
- Exact authenticated/rewardable activity-session binding.
- Mini App coin button, server balance, cooldown, and daily progress UI.

## What's complete (Integrated Phase 4)

- Referral milestones and pending-to-available rewards.
- Referral daily quality-bonus queue.
- Fraud signals and risk scoring.

## What's complete (Integrated Phase 5)

- Reward request state machine and locked balances.
- Test/Manual reward providers.
- Global daily Stars-equivalent budget and emergency payout pause.
- Mini App Rewards screen with server-provided available/locked balances and request history.

## What's complete (Integrated Phase 6)

- User and admin dashboards.
- Admin authorization and append-only audit log.
- Reward, risk, and operational overview controls.

## What's complete (Integrated Phase 7)

- FAQ-first support flow.
- AI provider abstraction with safe fallbacks.
- Read-only support tools with strict authorization.
- Mini App FAQ, support chat, and user ticket interface.

## What's next (Integrated Phase 8)

- Explicit CPU contribution consent and revocation.
- Signed, allowlisted benchmark tasks.
- Resource limits, thermal safety, and worker observability.
