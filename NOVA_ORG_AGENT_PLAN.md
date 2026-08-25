# NOVA ORG — Telegram Mini App + Internal Coin + Hybrid Compute Platform

> **Status:** MVP development plan  
> **Working bot name:** `NOVA ORG`  
> **Suggested username:** `@NovaOrgBot` *(Telegram’da band emasligini tekshirish kerak)*  
> **Core idea:** Telegram Bot + Mini App + internal coin economy + click rewards + opt-in, allowlist-based safe benchmark compute + Telegram reward queue.
> **Integrated requirements:** `docs/INTEGRATED_REQUIREMENTS.md` is normative. If this older plan conflicts with it, the integrated requirements take precedence.

---

## 1. Loyiha maqsadi

NOVA ORG — Telegram ichida ishlaydigan Mini App platforma.

Foydalanuvchi:

- Telegram orqali botga kiradi.
- Mini App ochadi.
- Ichki `NOVA Coin` balansiga ega bo‘ladi.
- Coinni:
  - daily reward;
  - task;
  - referral;
  - service usage;
  - server-confirmed clicks and referrals
  orqali yig‘adi.
- Coinni bot ichidagi servislar uchun ishlatadi.
- Qurilmasining hisoblash quvvatini **faqat o‘zi START bosgandan keyin** contribution uchun ulashi mumkin.
- `STOP` bosilganda qurilma contribution’i darhol to‘xtaydi.

Platforma egasi:

- Telegram bot va Mini App’ni boshqaradi.
- User, wallet, task, service, referral va compute statistikalarini admin paneldan ko‘radi.
- Server worker + user device worker’larni bir platformada boshqaradi.
- Coin reward’larni faqat server tasdiqlagan work asosida beradi.

---

# 2. Muhim prinsiplar

## 2.1. User qurilmasidan yashirin foydalanilmaydi

Device contribution quyidagi talablar asosida ishlaydi:

- avtomatik boshlanmaydi;
- user `START CONTRIBUTION` bosadi;
- userga CPU/battery impact ko‘rsatiladi;
- `STOP` tugmasi doim ko‘rinadi;
- browser/Mini App yopilsa contribution sessiyasi tugaydi yoki xavfsiz pauza qilinadi;
- fon rejimida yashirin ishlash yo‘q;
- reward faqat server validatsiyasidan keyin beriladi.

## 2.2. Bot serveri va xavfsiz compute worker ajratiladi

**Main VPS**:
- Telegram Bot
- Backend API
- PostgreSQL
- Redis
- Queue
- Admin API
- Mini App hosting

**Compute Worker**:
- alohida server yoki dedicated machine;
- bot API’dan job oladi;
- ishni bajaradi;
- natijani validator’ga yuboradi.

> Mining, yashirin hisoblash va serverdan ixtiyoriy kod olib bajarish taqiqlanadi. MVP faqat oldindan kodga kiritilgan, versiyalangan va zararli bo‘lmagan benchmark tasklarini bajaradi.

---

# 3. Tavsiya etilgan texnologiyalar

## Frontend

- React 18+
- Vite
- TypeScript
- React Router
- Zustand yoki Redux Toolkit
- TanStack Query
- Tailwind CSS
- Lucide React
- Telegram Mini Apps SDK

## Backend

- Node.js
- TypeScript
- Fastify
- Zod
- Prisma yoki Drizzle ORM
- PostgreSQL
- Redis
- BullMQ

## Bot

- grammY yoki Telegraf
- Telegram Bot API
- Telegram Mini App deep link

## Compute

- Web Worker
- WebAssembly (WASM)
- server-side Worker service
- signed work units
- server-side validation

## Infrastructure

- Ubuntu 24.04 LTS
- Docker
- Docker Compose
- Nginx
- Let's Encrypt SSL
- Cloudflare *(ixtiyoriy)*
- Prometheus + Grafana *(keyingi bosqich)*
- Sentry *(keyingi bosqich)*

---

# 4. Umumiy arxitektura

```text
                         TELEGRAM
                            │
                  ┌─────────┴─────────┐
                  │                   │
             Telegram Bot         Mini App
                  │                   │
                  └─────────┬─────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Backend API  │
                    │   Fastify    │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   PostgreSQL            Redis              Queue
                                             │
                                             ▼
                                      Work Controller
                                             │
                           ┌─────────────────┴─────────────────┐
                           │                                   │
                           ▼                                   ▼
                  Server Worker                        User Devices
                                                     opt-in compute
                           │                                   │
                           └─────────────────┬─────────────────┘
                                             ▼
                                         Validator
                                             │
                                             ▼
                                      Reward Engine
                                             │
                                             ▼
                                         NOVA Coin
```

---

# 5. Telegram Bot funksiyalari

## Minimal command’lar

```text
/start
/app
/balance
/referral
/help
```

## `/start`

Vazifasi:

1. Telegram user ma’lumotlarini olish.
2. User DB’da mavjudligini tekshirish.
3. Yangi user bo‘lsa yaratish.
4. Referral code bo‘lsa saqlash.
5. `OPEN NOVA APP` tugmasini ko‘rsatish.

## Referral link

```text
https://t.me/NovaOrgBot?start=ref_USERCODE
```

---

# 6. Mini App sahifalari

## 6.1. Home / Command Center

Ko‘rsatadi:

- NOVA Coin balance
- current level
- energy
- contribution status
- mining/compute session
- daily streak
- active tasks
- service shortcuts
- network statistics

## 6.2. Contribution

Asosiy UI:

```text
DEVICE CONTRIBUTION

Status:
● OFFLINE / ● ACTIVE

Mode:
ECO
NORMAL

Session Time:
00:24:18

Verified Work:
1,842 units

Session Reward:
+184 NOVA

CPU Impact:
LOW / MEDIUM

Battery Impact:
LOW / MEDIUM

[ START CONTRIBUTION ]
[ STOP ]
```

### Mobile rejim

- ECO
- NORMAL

### Desktop rejim

- ECO
- NORMAL
- PERFORMANCE *(faqat user o‘zi tanlasa)*

---

# 7. Coin tizimi

Ichki coin nomi:

```text
NOVA Coin
Ticker: NVC
```

> MVP’da bu blockchain token emas. Bu platforma ichidagi internal utility coin.

## Coin olish usullari

- daily reward
- task
- referral
- verified device contribution
- promotional rewards
- admin grant
- service cashback *(keyinchalik)*

## Coin sarflash

Misol:

```text
AI Photo Analysis        500 NVC
AI Text Analysis         300 NVC
File Analysis            700 NVC
Premium Request          900 NVC
Daily Boost             1000 NVC
```

Narxlar Admin Panel’dan boshqariladi.

---

# 8. Wallet ledger

Faqat `users.balance` qilish tavsiya etilmaydi.

Ledger ishlatilsin:

```text
Wallet
  │
  └── Transactions
```

Har bir operatsiya alohida yoziladi.

Misol:

```text
+100  contribution_reward
+500  referral_reward
+50   daily_reward
-500  ai_photo_analysis
-300  ai_text_analysis
```

---

# 9. Database schema

## users

```text
id
telegram_id
username
first_name
last_name
language_code
referral_code
referred_by
status
created_at
updated_at
```

## wallets

```text
id
user_id
balance
total_earned
total_spent
updated_at
```

## coin_transactions

```text
id
user_id
wallet_id
type
amount
reference_type
reference_id
metadata_json
created_at
```

## devices

```text
id
user_id
device_hash
device_type
platform
capabilities_json
status
last_seen_at
created_at
```

## contribution_sessions

```text
id
user_id
device_id
mode
started_at
ended_at
verified_work
reward_amount
status
```

## work_units

```text
id
session_id
user_id
device_id
job_id
nonce
payload_hash
issued_at
expires_at
submitted_at
validation_status
verified_score
```

## tasks

```text
id
title
description
reward
type
requirements_json
status
starts_at
ends_at
```

## task_claims

```text
id
task_id
user_id
status
reward
claimed_at
```

## referrals

```text
id
referrer_user_id
referred_user_id
status
reward
created_at
```

## services

```text
id
name
slug
description
coin_price
status
config_json
```

## service_usage

```text
id
service_id
user_id
transaction_id
status
input_metadata
created_at
```

## admin_logs

```text
id
admin_id
action
entity_type
entity_id
before_json
after_json
created_at
```

---

# 10. Redis

Redis quyidagilar uchun:

- active contribution sessions
- energy state
- rate limiting
- work queue
- temporary work validation state
- leaderboard cache
- online user state
- bot anti-spam
- distributed locks

Key format misollar:

```text
user:{id}:energy
user:{id}:session
device:{id}:status
work:{id}:state
leaderboard:daily
rate:user:{id}
```

---

# 11. Contribution / Compute flow

## Start

```text
User presses START
        │
        ▼
Frontend shows consent
        │
        ▼
POST /contribution/start
        │
        ▼
Backend creates session
        │
        ▼
Client requests work unit
        │
        ▼
Web Worker / WASM executes work
        │
        ▼
POST /work/submit
        │
        ▼
Server validates
        │
        ▼
Verified score added
        │
        ▼
Reward Engine
        │
        ▼
NOVA Coin ledger
```

---

# 12. Work Unit xavfsizligi

Har bir work unit:

```text
job_id
work_id
user_id
device_id
session_id
nonce
issued_at
expires_at
difficulty
payload_hash
signature
```

Server quyidagilarni tekshiradi:

- work server tomonidan berilganmi;
- muddati o‘tmaganmi;
- qayta submit qilinmaganmi;
- user/session mosmi;
- natija validmi;
- replay attack yo‘qmi;
- suspicious speed yo‘qmi.

---

# 13. Anti-cheat

Majburiy himoya:

- Telegram `initData` server-side validation
- JWT/session token
- rate limit
- nonce
- replay protection
- idempotency key
- signed work unit
- impossible speed detection
- device/session throttling
- duplicate result detection
- transaction ledger
- admin audit log

User frontenddan:

```text
POST /wallet/add
amount=1000000
```

kabi operatsiya orqali coin qo‘sha olmasligi kerak.

Coin faqat backend reward engine orqali o‘zgaradi.

---

# 14. Energy tizimi

MVP misol:

```text
Max Energy: 1000
```

Contribution vaqtida energy kamayadi.

Backend energy qiymatining yagona source of truth’i bo‘ladi.

Misol:

```text
ECO:
-4 energy / minute

NORMAL:
-8 energy / minute
```

Energy vaqt bilan tiklanishi mumkin.

Barcha qiymatlar Admin Panel orqali o‘zgartiriladigan qilib yozilsin.

---

# 15. Reward Engine

Reward oddiy tap soniga bog‘lanmasin.

Formula konsepti:

```text
verified_work × reward_rate × mode_multiplier
```

Misol:

```text
100 verified units = 10 NVC
```

Reward limitlar:

- hourly cap
- daily cap
- device cap
- suspicious activity cap

Barcha reward rate’lar DB/config orqali boshqarilsin.

---

# 16. Server worker + user worker

## Server Worker

Alohida service:

```text
nova-worker
```

Vazifasi:

- queue’dan job olish;
- compute bajarish;
- result submit;
- health status yuborish.

## User Worker

Telegram Mini App ichida:

```text
Web Worker
    │
    ▼
WASM Module
    │
    ▼
Submit Result
```

UI thread bloklanmasin.

---

# 17. Serverlar

## SERVER A — Main VPS

MVP uchun:

```text
4 vCore
8 GB RAM
160 GB SSD/NVMe
Ubuntu 24.04
```

Vazifasi:

- Telegram bot
- Mini App
- API
- PostgreSQL
- Redis
- BullMQ
- Admin API
- Nginx

## SERVER B — Compute Worker

Keyin alohida qilinadi.

Variant:

```text
8+ CPU cores
16–32 GB RAM
NVMe
```

yoki compute turi talab qilsa GPU/dedicated hardware.

> Server provider qoidalarida mining/compute ruxsat berilgan bo‘lishi shart.

---

# 18. Docker services

```yaml
services:
  nginx:
  bot:
  api:
  frontend:
  admin:
  postgres:
  redis:
  worker:
```

Production’da:

```text
nginx
  │
  ├── app.domain.com
  ├── api.domain.com
  └── admin.domain.com
```

---

# 19. Environment variables

```env
NODE_ENV=production

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=NovaOrgBot

APP_URL=https://app.example.com
API_URL=https://api.example.com
ADMIN_URL=https://admin.example.com

DATABASE_URL=
REDIS_URL=

JWT_SECRET=
SESSION_SECRET=

WORK_SIGNING_SECRET=

ADMIN_TELEGRAM_IDS=
```

Secret’lar Git’ga commit qilinmaydi.

---

# 20. API rejasi

## Auth

```text
POST /api/auth/telegram
POST /api/auth/refresh
POST /api/auth/logout
```

## User

```text
GET /api/me
GET /api/me/stats
GET /api/me/devices
```

## Wallet

```text
GET /api/wallet
GET /api/wallet/transactions
```

## Contribution

```text
POST /api/contribution/start
POST /api/contribution/stop
GET  /api/contribution/status
```

## Work

```text
POST /api/work/request
POST /api/work/submit
```

## Tasks

```text
GET  /api/tasks
POST /api/tasks/:id/claim
```

## Referral

```text
GET /api/referral
GET /api/referral/list
```

## Services

```text
GET  /api/services
POST /api/services/:slug/use
```

## Leaderboard

```text
GET /api/leaderboard/daily
GET /api/leaderboard/weekly
```

---

# 21. Admin Panel

UI yo‘nalishi:

**Dark premium intelligence / command center**

Asosiy menyu:

```text
Overview
Users
Wallet
Contribution
Workers
Tasks
Services
Referrals
Leaderboard
Security
Settings
Logs
```

## Overview KPI

```text
Total Users
Online Users
Active Sessions
Active Devices
Verified Work / sec
Server Worker Power
Community Power
Total Network Power
Coins Issued
Coins Spent
Service Usage
Fraud Alerts
```

## Network Power

```text
SERVER POWER
████████░░

COMMUNITY POWER
██████████

TOTAL COMPUTE
1.84 GH/s / unit equivalent
```

> Display unit actual compute algorithm’ga qarab keyin aniqlanadi.

---

# 22. UI Design System

Yo‘nalish:

- modern intelligence command center
- premium dark
- minimal cyber
- 007-agent aesthetic ruhida, lekin franchise branding/logosiz
- game UI emas
- professional SaaS/control system

## Ranglar

```text
Background:    #05090D
Surface:       #0A1118
Surface 2:     #0D1720
Border:        rgba(68, 220, 235, 0.18)

Primary Cyan:  #36DDE8
Teal:          #34C8B6
Gold:          #D5A84B
Warning:       #E5A84B
Critical:      #D95C5C
Success:       #40C78B

Text:          #EAF4F5
Muted:         #7F9198
```

## Card style

- 1px thin border
- very subtle glow
- cut-corner yoki restrained radius
- hover’da yengil cyan edge
- ortiqcha glassmorphism yo‘q

---

# 23. Mini App asosiy UI

```text
┌─────────────────────────────────┐
│ NOVA CORE              ● SECURE │
├─────────────────────────────────┤
│                                 │
│         NOVA COIN               │
│          12,480                 │
│                                 │
│       [ COIN CORE ]             │
│                                 │
│ Device Contribution             │
│ ● ACTIVE                        │
│                                 │
│ Verified Work    1,842          │
│ Session Reward   +184 NVC       │
│                                 │
│ ENERGY                          │
│ ████████░░  742 / 1000          │
│                                 │
│ [ STOP CONTRIBUTION ]           │
├─────────────────────────────────┤
│ Home   Tasks   Services  Profile│
└─────────────────────────────────┘
```

---

# 24. Development folder structure

```text
nova-org/
│
├── apps/
│   ├── bot/
│   ├── api/
│   ├── mini-app/
│   └── admin/
│
├── packages/
│   ├── db/
│   ├── shared/
│   ├── validation/
│   ├── ui/
│   └── config/
│
├── workers/
│   ├── validator/
│   └── server-worker/
│
├── infra/
│   ├── nginx/
│   ├── docker/
│   └── scripts/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── database.md
│   └── security.md
│
├── docker-compose.yml
├── .env.example
├── README.md
└── AGENTS.md
```

---

# 25. Agentlarga bo‘lib berish

## AGENT 1 — Architecture + Monorepo

Vazifa:

- monorepo yaratish;
- workspace sozlash;
- shared TypeScript config;
- ESLint;
- Prettier;
- environment validation;
- Docker skeleton.

### Done criteria

- `npm install` ishlaydi;
- barcha app’lar build bo‘ladi;
- `.env.example` mavjud;
- Docker Compose start bo‘ladi.

---

## AGENT 2 — Database + Auth

Vazifa:

- PostgreSQL schema;
- migrations;
- Telegram initData validation;
- users;
- wallets;
- transactions;
- devices;
- sessions.

### Done criteria

- Telegram orqali login;
- user avtomatik yaratiladi;
- wallet avtomatik yaratiladi;
- invalid initData rad qilinadi.

---

## AGENT 3 — Telegram Bot

Vazifa:

- `/start`;
- referral parsing;
- Mini App button;
- `/balance`;
- `/help`;
- bot rate limit.

### Done criteria

- yangi user `/start` qiladi;
- DB’da yaratiladi;
- Mini App ochiladi;
- referral saqlanadi.

---

## AGENT 4 — Mini App UI

Vazifa:

- NOVA dark UI;
- Home;
- Contribution;
- Tasks;
- Services;
- Referral;
- Profile;
- Telegram theme integration.

### Done criteria

- mobile-first;
- Telegram WebView’da to‘g‘ri ko‘rinadi;
- loading/error states bor;
- responsive.

---

## AGENT 5 — Contribution Engine

Vazifa:

- start/stop session;
- device registration;
- Web Worker;
- WASM interface;
- work request;
- work submit;
- client progress.

### Muhim

User roziligisiz contribution boshlanmasin.

### Done criteria

- START ishlaydi;
- work olinadi;
- Web Worker bajaradi;
- STOP darhol to‘xtatadi;
- session statistikasi qaytadi.

---

## AGENT 6 — Validator + Anti-Cheat

Vazifa:

- signed work units;
- nonce;
- expiry;
- replay prevention;
- duplicate protection;
- rate limits;
- suspicious speed detector;
- server verification.

### Done criteria

Fake submit coin bermaydi.

---

## AGENT 7 — Reward + Wallet

Vazifa:

- verified work → reward;
- wallet ledger;
- transaction types;
- daily/hourly caps;
- idempotent reward processing.

### Done criteria

Har bir reward uchun ledger transaction mavjud.

---

## AGENT 8 — Tasks + Referral + Services

Vazifa:

- daily tasks;
- referral reward;
- service catalog;
- coin payment;
- balance checks.

### Done criteria

Coin faqat backend orqali sarflanadi.

---

## AGENT 9 — Admin Panel

Vazifa:

- dashboard;
- users;
- contribution;
- workers;
- tasks;
- services;
- wallet;
- security alerts;
- logs;
- settings.

### Done criteria

Admin reward rate va service narxlarini UI’dan boshqaradi.

---

## AGENT 10 — Deployment + Security

Vazifa:

- Docker production;
- Nginx;
- SSL;
- backups;
- logging;
- health checks;
- firewall;
- deploy script.

### Done criteria

```text
https://app.domain.com
https://api.domain.com
https://admin.domain.com
```

ishlaydi.

---

# 26. Ish tartibi

## PHASE 1 — Foundation

```text
[ ] Monorepo
[ ] Docker
[ ] PostgreSQL
[ ] Redis
[ ] Telegram Auth
[ ] Bot
[ ] Mini App skeleton
```

## PHASE 2 — Coin Economy

```text
[ ] Wallet
[ ] Ledger
[ ] Energy
[ ] Tasks
[ ] Referral
[ ] Services
[ ] Server-confirmed click engine (2 soniya cooldown, 1 000/kun)
[ ] Integer microcoin ledger (1 click = 1 microcoin)
[ ] Idempotency va concurrent click himoyasi
```

## PHASE 3 — Contribution

```text
[ ] Device registration
[ ] Consent UI
[ ] Session start/stop
[ ] Web Worker
[ ] WASM interface
[ ] Work queue
[ ] Validator
[ ] Reward Engine
[ ] Maksimal 10 daqiqalik sessiya va 2 daqiqalik cooldown
[ ] Hidden/idle holatida avtomatik pause
[ ] Faqat versiyalangan task allowlist; remote JS/WASM taqiqlangan
```

## PHASE 4 — Admin

```text
[ ] Dashboard
[ ] Users
[ ] Wallet
[ ] Tasks
[ ] Services
[ ] Workers
[ ] Fraud monitoring
[ ] Reward request state machine va TestRewardProvider
[ ] 50 Stars/kun loyiha budjeti va emergency pause
[ ] FAQ-first support va read-only AI adapter
```

## PHASE 5 — Production

```text
[ ] Domain
[ ] SSL
[ ] VPS deployment
[ ] Backup
[ ] Monitoring
[ ] Load test
[ ] Security review
```

---

# 27. MVP scope

Birinchi release’da faqat:

```text
Telegram Bot
Telegram Login
Mini App
User Profile
Wallet
NOVA Coin
Daily Reward
Tasks
Referral
Contribution START/STOP
Basic Web Worker
Verified Work
Reward Engine
Service Catalog
Admin Dashboard
```

Keyingi versiyaga qoldiriladi:

```text
Advanced leaderboard
Telegram Stars
multiple compute algorithms
GPU-specific client
advanced fraud ML
multi-region workers
advanced analytics
```

---

# 28. Acceptance Criteria

MVP tayyor deb hisoblanishi uchun:

- [ ] Telegram bot `/start` ishlaydi.
- [ ] Mini App Telegram ichida ochiladi.
- [ ] Telegram auth serverda tekshiriladi.
- [ ] User va wallet avtomatik yaratiladi.
- [ ] Coin ledger ishlaydi.
- [ ] User balance frontendda ko‘rinadi.
- [ ] Task reward ishlaydi.
- [ ] Referral ishlaydi.
- [ ] Service coin bilan sotib olinadi.
- [ ] User contribution’ni o‘zi START qiladi.
- [ ] STOP darhol contribution’ni to‘xtatadi.
- [ ] Work serverdan olinadi.
- [ ] Work natijasi server tomonidan validatsiya qilinadi.
- [ ] Fake work coin bermaydi.
- [ ] Reward faqat verified work asosida yoziladi.
- [ ] Admin barcha asosiy statistikani ko‘radi.
- [ ] Admin reward va service narxlarini boshqaradi.
- [ ] Production HTTPS bilan ishlaydi.
- [ ] Secret’lar repository’da yo‘q.
- [ ] DB backup mavjud.
- [ ] Rate limiting mavjud.
- [ ] Audit log mavjud.

---

# 29. Agentlar uchun asosiy qoida

Har bir agent:

1. mavjud arxitekturani buzmasin;
2. boshqa modulni keraksiz qayta yozmasin;
3. yangi dependency qo‘shishdan oldin mavjudini tekshirsin;
4. barcha API input’larni Zod orqali tekshirsin;
5. frontend qiymatlariga ishonmasin;
6. coin faqat backend ledger orqali o‘zgarsin;
7. contribution faqat explicit user consent bilan ishlasin;
8. secret’larni hardcode qilmasin;
9. har bir muhim mutation audit/log qilsin;
10. task tugaganda test/build ishga tushirsin.

---

# 30. Birinchi agentga beriladigan START PROMPT

```text
You are the lead engineer for NOVA ORG.

Build the project foundation only. Do not implement advanced contribution/mining logic yet.

Project:
Telegram Bot + Telegram Mini App + internal NOVA Coin platform.

Stack:
- TypeScript
- Node.js
- Fastify
- React + Vite
- PostgreSQL
- Redis
- Docker
- Telegram Bot API
- grammY or Telegraf

Create a clean monorepo:

apps/
  bot/
  api/
  mini-app/
  admin/

packages/
  db/
  shared/
  validation/
  ui/
  config/

workers/
  validator/
  server-worker/

infra/
  nginx/
  docker/
  scripts/

Requirements:
1. Create workspace configuration.
2. Create shared TypeScript config.
3. Add linting and formatting.
4. Add .env.example with validation.
5. Add Docker Compose for PostgreSQL and Redis.
6. Create Fastify API skeleton with /health.
7. Create Telegram bot skeleton with /start and /help.
8. Create React/Vite Mini App skeleton.
9. Create React/Vite Admin skeleton.
10. Add README with exact local startup commands.
11. Do not implement fake coin logic.
12. Do not implement contribution automatically.
13. No device compute may start without explicit user action.
14. Run typecheck/build before finishing.

When finished, report:
- files created;
- commands to run;
- environment variables required;
- what is complete;
- what remains for Phase 2.
```

---

# 31. Keyingi qadam

Avval **PHASE 1 — Foundation** to‘liq ishlatilsin.

Shundan keyin navbat:

```text
PHASE 2
Wallet + Coin + Tasks + Referral

PHASE 3
Device Contribution + Validation + Rewards
```

Shu tartib saqlansa, loyiha modulli, xavfsiz va keyinchalik scale qilishga tayyor bo‘ladi.
