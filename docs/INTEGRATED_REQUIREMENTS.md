# NOVA ORG — integratsiyalangan mahsulot talablari

## 1. Maqsad va ustuvorlik

Ushbu hujjat `NOVA_ORG_AGENT_PLAN.md` hamda foydalanuvchi bergan Telegram Mini App talablarini birlashtiradi. Qarama-qarshilik bo‘lsa, quyidagi qoidalar ustuvor:

1. foydalanuvchi roziligi va xavfsizlik;
2. server-authoritative balans, vaqt va limitlar;
3. immutable ledger va idempotency;
4. real Telegram Stars mexanizmi rasmiy tasdiqlanmaguncha test/manual provider;
5. mavjud ishlaydigan kodni sababsiz qayta yozmaslik.

Mavjud monorepo TypeScript/Fastify/Prisma asosida boshlangan. FastAPI/aiogram talabi funksional talab sifatida qabul qilinadi, ammo Phase 1 skeletini qayta yozmaslik uchun amaldagi Node.js stack saqlanadi. Telegram bot uchun grammY yoki Telegraf ishlatiladi. Barcha quyidagi contract va xavfsizlik qoidalari stackdan qat’i nazar bajariladi.

## 2. Tasdiqlangan iqtisodiy model

- `1 coin = 100 000 microcoin`.
- Bir server tasdiqlagan click `1 microcoin` beradi.
- Clicklar oralig‘i kamida 2 soniya.
- Bir foydalanuvchi kuniga ko‘pi bilan 1 000 tasdiqlangan click oladi (`0.01 coin`).
- Reward so‘rovi uchun kamida `1 available coin` kerak.
- Bir foydalanuvchi kuniga ko‘pi bilan bitta reward so‘rashi mumkin.
- Boshlang‘ich loyiha payout limiti `50 Stars/kun`, ya’ni ko‘pi bilan beshta 10 Stars qiymatidagi reward.
- Umumiy boshlang‘ich budjet: 5 000 Stars; user reward 3 500, dispute 750, test 500, emergency 250.
- Qiymatlar `system_settings` orqali admin paneldan o‘zgaradi; kodda qotirilmaydi.
- Ichki coin va Telegram Stars alohida accounting obyektlari bo‘ladi.

## 3. Xavfsiz foydalanuvchi oqimi

1. Mini App `initData`ni APIga yuboradi.
2. API Telegram Bot API algoritmi bilan hash va `auth_date`ni tekshiradi; `initDataUnsafe`ga ishonmaydi.
3. API qisqa muddatli sessiya beradi; bot token frontendga chiqmaydi.
4. Click request `request_id`/idempotency key bilan keladi.
5. API sessiya, heartbeat, cooldown, kunlik limit va riskni transaction ichida tekshiradi.
6. Tasdiqlangan click immutable ledgerga yoziladi; client yuborgan amount/balance/time rad etiladi.
7. Reward so‘ralganda 1 coin available balansdan locked balansga transaction orqali o‘tadi.
8. Reward state machine va budjet locki duplicate payoutni bloklaydi.

## 4. Reward state machine

`REQUESTED -> RISK_CHECK -> APPROVED -> QUEUED -> SENDING -> PAID`

Muqobil holatlar: `REVIEW_REQUIRED`, `FAILED`, `REJECTED`, `REFUNDED`.

Provider contract:

- `TestRewardProvider` — MVP va avtomatik testlar uchun;
- `ManualRewardProvider` — operator tasdig‘i bilan;
- `GiftRewardProvider` va `GiveawayRewardProvider` — faqat rasmiy Telegram imkoniyati texnik tekshirilgach;
- UI tasdiqlanguncha “10 Stars qiymatidagi Telegram mukofoti” deb yozadi.

## 5. Referral modeli

- Deep link: `/start ref_<referral_code>`.
- Self-referral va referrer almashtirish taqiqlanadi.
- Register: referrerga `0.005 pending coin`.
- 3 faol kun: qo‘shimcha `0.005 pending coin`.
- 7 faol kun: qo‘shimcha `0.010 coin`.
- Yangi user: jami `0.005 coin`.
- Sifatli referral: 7 xil faol kun, 30 daqiqa active time, 300 valid click va risk tekshiruvi.
- Bir referrer uchun kuniga 5 ta quality bonus ochiladi; qolganlari navbatda qoladi.

## 6. Activity va heartbeat

- Mini App har 20 soniyada heartbeat yuboradi.
- 60 soniya heartbeat bo‘lmasa user `OFFLINE`.
- Holatlar: `ONLINE`, `ACTIVE`, `IDLE`, `BACKGROUND`, `OFFLINE`.
- Hidden sahifa active time bermaydi.
- Parallel sessiyalardan faqat bittasi rewardable.
- IP faqat risk signali; IP asosida avtomatik ban yo‘q. IP hash/prefix va retention sozlamalari qo‘llanadi.

## 7. CPU/compute xavfsizlik contracti

- Click reward CPU roziligiga bog‘lanmaydi.
- Compute alohida opt-in va alohida modul.
- MVP faqat repo ichida oldindan yozilgan deterministic benchmark tasklarini bajaradi.
- Serverdan JavaScript, WASM binary yoki executable qabul qilib bajarilmaydi.
- Tasklar `task_type`, `version`, `task_id`, expiry va server imzosi orqali allowlist qilinadi.
- Web Worker UI threadni bloklamaydi.
- Boshlang‘ich yuk past; worker soni, task hajmi va tanaffus bilan throttling qilinadi.
- Sessiya ko‘pi bilan 10 daqiqa; sessiyalar orasida 2 daqiqa cooldown.
- Hidden, Stop, consent revoke yoki Mini App yopilishida worker darhol to‘xtaydi.
- Mining va yashirin/fondagi hisoblash qat’iyan taqiqlanadi.

## 8. AI support chegarasi

Avval FAQ/deterministic javob, keyin provider abstraction. OpenAI Responses API va keyinchalik Ollama adapteri qo‘shilishi mumkin.

Allowlist tool'lar: `get_my_balance`, `get_my_click_stats`, `get_my_referral_status`, `get_my_reward_status`, `create_support_ticket`, `list_public_faq`. Authenticated user ID server tomonidan kiritiladi. AI balans, payout, risk, ban, rol yoki konfiguratsiyani o‘zgartira olmaydi va erkin SQL/shell bajarmaydi.

## 9. Minimal domain jadvallari

`users`, `telegram_sessions`, `activity_sessions`, `heartbeats`, `click_events`, `coin_ledger`, `coin_balances`, `referral_links`, `referrals`, `referral_milestones`, `reward_requests`, `reward_transactions`, `reward_budget`, `fraud_signals`, `risk_scores`, `cpu_consents`, `cpu_sessions`, `compute_tasks`, `compute_results`, `support_tickets`, `support_messages`, `ai_conversations`, `faq_articles`, `admin_users`, `admin_audit_logs`, `system_settings`, `notification_events`.

Pul va coin uchun float taqiqlanadi; integer micro-unit yoki database `Decimal/Numeric` ishlatiladi.

## 10. API contract guruhlari

- Auth: `/auth/telegram`, `/auth/refresh`, `/auth/logout`.
- User: `/me`, `/me/stats`, `/me/balance`, `/me/sessions`.
- Click: `POST /click`, `GET /click/status`.
- Referral: `/referrals`, `/referrals/link`, `/referrals/stats`.
- Rewards: `POST /rewards/request`, `GET /rewards`, `GET /rewards/{id}`.
- Activity: `POST /activity/heartbeat`, `POST /activity/state`.
- Compute: consent, session start/stop, task/result/status endpointlari.
- Support: FAQ, chat va ticket endpointlari.
- Admin: dashboard, users, rewards, fraud, support, audit va settings endpointlari.

Har bir mutation authentication, validation, rate limit, audit va kerakli joyda idempotency talab qiladi.

## 11. Integratsiyalangan bajarish tartibi

- Phase 1 — mavjud monorepo, Docker, PostgreSQL, Redis, API/bot/frontend skeletonini yakunlash.
- Phase 2 — Telegram auth, user/session, heartbeat va privacy asoslari.
- Phase 3 — click engine, microcoin ledger, balance, concurrency va idempotency.
- Phase 4 — referral milestones va risk engine.
- Phase 5 — reward state machine, TestRewardProvider, budget va emergency pause.
- Phase 6 — user/admin dashboard va audit log.
- Phase 7 — FAQ-first support, AI abstraction va read-only tools.
- Phase 8 — explicit CPU consent va safe benchmark worker.
- Phase 9 — unit/integration/security/load testlar, backup, monitoring va deployment guide.

Har phase tugaganda build, typecheck, lint va tegishli testlar ishga tushiriladi. Real payout Phase 5da faqat test/manual provider bilan qoladi.

## 12. Majburiy testlar

Telegram initData, click cooldown/daily limit/idempotency/concurrency, referral self/duplicate/milestones, ledger integrity, insufficient balance, duplicate payout, Stars daily budget, reward state machine, risk scoring, heartbeat active time, concurrent sessions, CPU consent/revoke/task allowlist, support authorization, AI tool authorization va admin audit logging.

Moliyaviy testlarda transaction rollback va parallel requestlar majburiy.
