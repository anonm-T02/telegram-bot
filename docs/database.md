# Database

`packages/db` wires up a Prisma client pointed at `DATABASE_URL`. Integrated
Phase 2 adds Telegram authentication and activity tracking while retaining the
bot-only wallet surface:

- `User` — Telegram identity, unique `referralCode`, optional
  `referredById`.
- `Wallet` — one per user; `balance`, `totalEarned`, `totalSpent`.
- `CoinTransaction` — append-only ledger row for every balance change.
- `DailyClaim` — one row per `(userId, claimDate)`; the unique constraint
  is what makes `/internal/rewards/daily` idempotent.
- `Referral` — one row per referred user (`referredUserId` is unique, so
  a user can only be referred once); tracks the reward paid to the
  referrer.
- `TelegramSession` — stores only access/refresh token hashes, expiry,
  revocation and privacy-reduced request metadata. Raw tokens are never stored.
- `ActivitySession` — server-authoritative ONLINE/ACTIVE/IDLE/BACKGROUND/OFFLINE
  state, accumulated active seconds, rewardability, and last heartbeat time.
- `Heartbeat` — append-only heartbeat observations. The `(activitySessionId,
clientSequence)` constraint makes retries idempotent.
- `ClickEvent` — append-only accepted/rejected click attempt. `requestId` is a
  globally unique idempotency key; timestamps, outcome and reward are always
  server-authored. An accepted event links to at most one `CLICK_REWARD`
  transaction, while rejected attempts carry a structured reason.
- `ClickDailyCounter` — one row per `(userId, UTC clickDate)`, transactionally
  locked or conditionally updated by the API. It stores accepted count, total
  reward and the last accepted server timestamp, allowing the 2-second cooldown
  and 1,000-click daily cap to be enforced atomically under concurrency.
- `ReferralLink` — canonical unique deep-link code, backfilled from legacy data.
- `Referral` — immutable pairing plus server-derived quality progress.
- `ReferralMilestone` — idempotent register, 3-day, 7-day quality and referred-user obligations.
- `ReferralReleaseCounter` — locked per-referrer/day counter for the five-release cap.
- `FraudSignal` — weighted observations with evidence metadata and expiry.
- `RiskScore` — current `0..100` score and reward-safety level.

All coin values are integer **microcoin** values stored as PostgreSQL `BIGINT`
(`1 coin = 100,000 microcoin`). API boundaries must serialize these values as
decimal strings because JSON and JavaScript numbers cannot represent every
64-bit integer exactly. Floats must never be used for coin accounting.

`Wallet.balance` remains the available balance for compatibility with existing
bot-only wallet commands. `lockedBalance` and `pendingBalance` are separate
`BIGINT` buckets reserved for later reward/referral state machines. Moving value
between buckets must happen in one transaction with matching ledger entries;
database checks prevent every bucket from becoming negative.

Phase 3 click accounting uses one database transaction: establish/lock the UTC
daily counter, evaluate the server clock and limit, append `ClickEvent`, and for
an accepted click atomically increment the counter and wallet, then append its
unique `CLICK_REWARD` transaction. A duplicate `requestId` returns the existing
event and must never credit again. Migration triggers make `ClickEvent` and
`CoinTransaction` append-only; corrections use compensating ledger entries.

Only one parallel activity session may be rewardable. The API must still claim
and release it transactionally, while the migration's partial unique index on
`(userId) WHERE status = OPEN AND isRewardable` closes concurrent races at the
database layer. This index is migration-managed because Prisma cannot express
partial indexes in the schema.

Heartbeat policy is server authoritative: clients normally report every 20
seconds; after 60 seconds without a heartbeat the API marks the activity
session OFFLINE/EXPIRED. Hidden pages use BACKGROUND and do not add active time.

Migrations live in `packages/db/prisma/migrations`. Apply them with:

```bash
npm run prisma:generate -w @nova-org/db
npm run prisma:deploy -w @nova-org/db
```

The full target schema (devices, contribution_sessions, work_units,
tasks, services, admin_logs, etc.) is specified in
`NOVA_ORG_AGENT_PLAN.md` section 9 and lands in later phases.

## Phase 4 referral and risk accounting

Referral amounts are integer microcoin obligations: register gives the
referrer 500 pending microcoin, three active days adds 500 pending microcoin,
the quality milestone adds 1,000 microcoin, and the referred user receives 500
microcoin after qualification. Qualification requires seven distinct active
days, 1,800 active seconds, 300 accepted clicks and a risk check. The backend
evaluates thresholds and releases; the database stores evidence, queue state
and unique idempotency keys.

The migrations preserve existing data. Every user gets a `ReferralLink` with
the same code. Every legacy referral gets all four milestone obligations;
already `REWARDED` rows have only their previously paid register milestone
marked `RELEASED`, while the three future obligations remain `PENDING`.
Unpaid register obligations also remain `PENDING`. Legacy `User.referralCode`,
`Referral.reward`, and `REFERRAL_REWARD` remain during the API compatibility
window. IP/device matches are risk signals rather than automatic bans.

`ReferralPendingReconciliation` records the one-time legacy pending-bucket
repair per wallet. The migration calculates all outstanding register and
3-active-day obligations, then applies only a positive deficit over the
existing `Wallet.pendingBalance`; this preserves amounts already added by the
Phase 4 API and prevents double counting. The row stores before/after values,
the applied delta and a unique migration marker. No `CoinTransaction` is
created because reconciliation does not make coin available or earned; the
milestone remains the source-of-truth liability until normal release creates
its immutable ledger transaction.

`ReferralPendingReversal` closes a legacy edge case where a referral already
in terminal `REWARDED`/`REJECTED` state had newly backfilled open milestones.
Those milestones are rejected with a migration reason. The reversal is bounded
by the original reconciliation delta, the phantom obligation, and the balance
remaining above valid open obligations, so pending balance never becomes
negative and valid liabilities are not removed.

## Phase 5 reward accounting

`RewardRequest` is the server-authored reward state machine. Its allowed states
are `REQUESTED`, `RISK_CHECK`, `APPROVED`, `QUEUED`, `SENDING`, `PAID`,
`REVIEW_REQUIRED`, `FAILED`, `REJECTED`, and `REFUNDED`. The unique
`(userId, requestDate)` key enforces one request per user per UTC day, while the
globally unique `idempotencyKey` makes client retries safe. The initial defaults
are 100,000 microcoin locked for 10 Stars-equivalent units. These values are
also stored in `SystemSetting` and the API must read them rather than accept
amounts from a client.

Creating a request atomically moves value from `Wallet.balance` to
`Wallet.lockedBalance` and appends a `REWARD_LOCK` ledger row. Successful
delivery consumes locked value with `REWARD_REDEEM`; terminal rejection or
refund returns it with `REWARD_REFUND`. A unique `(rewardRequestId, type)` index
prevents duplicate lock, redeem, or refund ledger effects. Existing nonnegative
wallet checks remain the final database guard against overspend.

`RewardTransaction` is separate Stars-equivalent provider accounting. MVP only
permits `TEST` and `MANUAL`; a row is unique per reward request and provider
idempotency key, so a retry cannot create a second payout. No schema or UI claim
implies that a real Telegram Stars transfer exists. `RewardRequestTransition`
is an append-only audit trail for every state mutation.

`RewardBudget` is locked per UTC day to reserve against the initial 50-unit
daily project limit. Its check requires `reservedUnits + paidUnits <=
dailyLimit`. `RewardBudgetPool` separately accounts for the initial global
5,000-unit allocation: user rewards 3,500, disputes 750, testing 500, and
emergency 250. Pool checks prevent reserved plus spent units from exceeding an
allocation.

`SystemSetting` contains runtime JSON controls, including
`reward.payoutPaused`. The emergency pause must be checked inside the same
transaction that locks wallet value and reserves budget. Initial settings also
store coin cost, reward units, and the daily limit; changing a setting does not
rewrite historical request amounts.
