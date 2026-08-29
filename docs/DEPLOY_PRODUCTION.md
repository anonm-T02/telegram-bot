# NOVA ORG production deployment

This runbook prepares `anonm-T02/telegram-bot` (`main`) for production. DNS is
managed at Spaceship. Do not change nameservers or any DNS record automatically;
preserve existing records including `chat.ilmora.space` and `www.ilmora.space`.

## 1. Configure production secrets

Use Google Secret Manager/Cloud Run for server secrets and a protected GitHub
environment named `production` for Cloudflare deployment credentials. Never put
secret values in Git, build arguments, `VITE_*`, logs, or DNS.

Cloud Run environment/secrets:

- `NODE_ENV=production`
- `APP_URL=https://app.ilmora.space`
- `ADMIN_URL=https://admin.ilmora.space`
- `API_URL=https://api.ilmora.space`
- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET`, `SESSION_SECRET`, `WORK_SIGNING_SECRET`, `INTERNAL_API_SECRET`
- Optional NOVA AI service: `CLOUDFLARE_AI_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`
  (Workers AI Read permission), `CLOUDFLARE_AI_MODEL`, `CLOUDFLARE_AI_DAILY_BONUS=5`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `ADMIN_TELEGRAM_IDS`
- Bot only: `TELEGRAM_WEBHOOK_URL=<NOVA_BOT_CLOUD_RUN_URL>` and an independent
  32+ character `TELEGRAM_WEBHOOK_SECRET`
- API: `TRUST_PROXY_HOPS=1`; Cloud Run supplies `PORT`

Rotate the Telegram token that was used during development before deployment.

GitHub `production` environment secrets:

- `CLOUDFLARE_API_TOKEN` (least-privilege Pages edit token)
- `CLOUDFLARE_ACCOUNT_ID`
- `GOOGLE_CLOUD_PROJECT_ID`, `DATABASE_URL`, `REDIS_URL`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` (required by the
  Google deploy workflow; use Workload Identity, never a JSON key)
- `JWT_SECRET`, `SESSION_SECRET`, `WORK_SIGNING_SECRET`, `INTERNAL_API_SECRET`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`

GitHub environment variables:

- `PRODUCTION_API_URL=https://api.ilmora.space`
- `CLOUDFLARE_MINI_APP_PROJECT=nova-mini-app`
- `CLOUDFLARE_ADMIN_PROJECT=nova-admin`

## 2. Create PostgreSQL database

Create a private PostgreSQL instance reachable from Cloud Run. Require TLS and
least-privilege credentials. Record its connection string only as `DATABASE_URL`.
Do not expose port 5432 publicly or use the local Docker credentials.

## 3. Create Redis database

Create a private Redis service reachable from Cloud Run and store its TLS URL as
`REDIS_URL`. Production startup fails when required URLs are absent; never use
`localhost:6379` in Cloud Run.

## 4. Deploy `nova-api` to Cloud Run

- Project: `NOVA ORG` (use its actual Google project ID in commands)
- Region: `europe-west1`
- Service: `nova-api`
- Source context: repository root
- Dockerfile: `Dockerfile.api`
- Minimum instances: `0`; maximum instances: `2`
- Allow unauthenticated: yes
- Container port: Cloud Run-provided `PORT`

Build and deploy a no-traffic revision first. Keep the generated `run.app` URL.

## 5. Verify API health

Check `GET <NOVA_API_RUN_URL>/health` and `GET <NOVA_API_RUN_URL>/ready`. Neither
endpoint returns secrets; `/ready` verifies PostgreSQL connectivity.

## 6. Run Prisma production migration

Run once as a gated Cloud Run Job or trusted operator step using the exact API
image and production `DATABASE_URL`:

```bash
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Take and verify a PostgreSQL backup first. Never run `migrate dev`, reset, drop,
or recreate against production.

## 7. Deploy `nova-bot`

- Region: `europe-west1`
- Service: `nova-bot`
- Source context: repository root
- Dockerfile: `Dockerfile.bot`
- Minimum instances: `0`; maximum instances: `1`
- Allow unauthenticated: yes (the endpoint validates Telegram's secret header)

Production uses webhook mode only. Development continues to use long polling.

## 8. Register Telegram webhook

Bot startup registers:

`<NOVA_BOT_CLOUD_RUN_URL>/telegram/webhook`

with `TELEGRAM_WEBHOOK_SECRET`. Verify Telegram webhook status and then check
`GET <NOVA_BOT_CLOUD_RUN_URL>/health`.

## 9. Deploy Mini App to Cloudflare Pages

- Project: `nova-mini-app`
- Repository: `anonm-T02/telegram-bot`
- Branch: `main`
- Root directory: repository root
- Build command: `npm ci && npm run build -w @nova-org/mini-app`
- Environment: `VITE_API_URL=https://api.ilmora.space`
- Output directory: `apps/mini-app/dist`
- Custom domain: `app.ilmora.space`

`apps/mini-app/public/_redirects` supplies the SPA fallback. Telegram SDK code is
unchanged and no secret is exposed to the frontend.

## 10. Deploy Admin to Cloudflare Pages

- Project: `nova-admin`
- Repository/branch/root: same as Mini App
- Build command: `npm ci && npm run build -w @nova-org/admin`
- Environment: `VITE_API_URL=https://api.ilmora.space`
- Output directory: `apps/admin/dist`
- Custom domain: `admin.ilmora.space`

## 11. Add custom domains

Add the custom domains in Cloudflare Pages and create the Cloud Run domain
mapping for `api.ilmora.space`. Record the exact verification targets shown by
Cloudflare and Google before touching Spaceship DNS.

## 12. Add Spaceship DNS records manually

Use the exact provider-generated values; placeholders must not be guessed:

| Type                   | Host                         | Value                                      |
| ---------------------- | ---------------------------- | ------------------------------------------ |
| CNAME                  | `app`                        | `<CLOUDFLARE_NOVA_MINI_APP_TARGET>`        |
| CNAME                  | `admin`                      | `<CLOUDFLARE_NOVA_ADMIN_TARGET>`           |
| `<GOOGLE_RECORD_TYPE>` | `api`                        | `<GOOGLE_CLOUD_RUN_DOMAIN_MAPPING_TARGET>` |
| TXT                    | `<GOOGLE_VERIFICATION_HOST>` | `<GOOGLE_VERIFICATION_VALUE>`              |

Do not alter nameservers or existing `chat`, `www`, mail, verification, or other
records. If Cloudflare Pages cannot validate a custom domain while Spaceship is
authoritative, follow the exact CNAME/TXT values Cloudflare displays.

## 13-15. Production verification

1. Open the Telegram Mini App at `https://app.ilmora.space`; verify initData auth,
   Home, Referrals, Rewards, Support, refresh, and server-confirmed balances.
2. Open `https://admin.ilmora.space`; verify one-time Telegram admin login, role
   boundaries, audit logs, support tickets, and emergency payout pause.
3. Verify API CORS permits only the two production origins, `/health` and `/ready`
   succeed, logs redact credentials, repeated auth is rate-limited, and neither
   PostgreSQL nor Redis is public.

## Rollback

- Cloudflare Pages: promote the previous known-good deployment for each project.
- Cloud Run: route 100% traffic to `<PREVIOUS_NOVA_API_REVISION>` and
  `<PREVIOUS_NOVA_BOT_REVISION>`.
- Database: prefer a forward corrective migration. Restore a verified backup only
  during a declared incident with API and bot stopped.
- Telegram: point the webhook back to the previous bot revision if it is compatible.
- DNS: restore recorded prior values only if application rollback is insufficient;
  never change nameservers during rollback.
