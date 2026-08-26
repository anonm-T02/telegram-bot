# Agent guidelines for NOVA ORG

This monorepo follows `NOVA_ORG_AGENT_PLAN.md`. Before making changes, read
the relevant section of that file for the module you're touching.

## Rules (see plan section 29)

1. Do not break existing architecture.
2. Do not rewrite another module unnecessarily.
3. Check for an existing dependency before adding a new one.
4. Validate all API input with Zod (`packages/validation`).
5. Never trust values coming from the frontend.
6. Coin balances only change through the backend ledger — never directly.
7. Contribution/compute only runs with explicit user consent (START/STOP).
8. Never hardcode secrets; use environment variables validated by
   `packages/config`.
9. Log/audit every significant mutation.
10. Run typecheck/build before considering a task finished.
11. Starting in integrated Phase 3, the Mini App may display balances and
    request server-authoritative click rewards through authenticated public
    endpoints. It must never submit reward amounts or mutate a wallet directly;
    every balance change is an idempotent backend-ledger transaction. Existing
    `/internal/*` routes remain bot-only and guarded by `INTERNAL_API_SECRET`.

## Commands

```bash
npm install                # install all workspaces
npm run docker:up          # start Postgres + Redis
npm run prisma:generate -w @nova-org/db   # generate Prisma client
npm run prisma:deploy -w @nova-org/db     # apply migrations
npm run dev:api            # Fastify API (http://localhost:4000)
npm run dev:bot            # Telegram bot (long polling)
npm run dev:mini-app       # Mini App (http://localhost:5173)
npm run dev:admin          # Admin Panel (http://localhost:5174)
npm run typecheck          # typecheck all workspaces
npm run build              # build all workspaces
npm run lint                # lint all TS/TSX files
npm run format:check        # verify formatting
```

## Workspace layout

```
apps/       bot, api, mini-app, admin
packages/   db, shared, validation, ui, config
workers/    validator, server-worker
infra/      nginx, docker, scripts
docs/       architecture, api, database, security
```
