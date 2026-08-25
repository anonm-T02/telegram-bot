# NOVA ORG

Telegram Bot + Telegram Mini App + internal `NOVA Coin` (NVC) economy +
opt-in device contribution platform.

Full product/technical plan: [`NOVA_ORG_AGENT_PLAN.md`](./NOVA_ORG_AGENT_PLAN.md).

> **Status:** Phase 1 — Foundation. Wallet, contribution, and reward logic
> are not implemented yet; this sets up the monorepo, tooling, and
> skeleton services only.

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

| Variable                | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`    | Bot token from @BotFather                       |
| `TELEGRAM_BOT_USERNAME` | Bot username, e.g. `NovaOrgBot`                 |
| `APP_URL`               | Mini App URL (used for the bot's WebApp button) |
| `API_URL`               | Backend API URL                                 |
| `ADMIN_URL`             | Admin Panel URL                                 |
| `DATABASE_URL`          | PostgreSQL connection string                    |
| `REDIS_URL`             | Redis connection string                         |
| `JWT_SECRET`            | Session/JWT signing secret                      |
| `SESSION_SECRET`        | Session cookie secret                           |
| `WORK_SIGNING_SECRET`   | Signing secret for compute work units           |
| `ADMIN_TELEGRAM_IDS`    | Comma-separated Telegram IDs with admin access  |

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

## What's complete (Phase 1)

- Monorepo with npm workspaces, shared TypeScript config, ESLint, Prettier.
- Environment validation (Zod) shared across apps.
- Docker Compose for PostgreSQL + Redis.
- Fastify API skeleton with `/health`.
- Telegram bot skeleton with `/start` (incl. referral deep-link parsing)
  and `/help`.
- Mini App skeleton (React + Vite + Telegram Mini Apps SDK bootstrap).
- Admin Panel skeleton (React + Vite).

## What's next (Phase 2)

- Wallet + coin ledger, energy system, tasks, referrals, services
  (see plan sections 7-9, 14, AGENT 2/7/8).
