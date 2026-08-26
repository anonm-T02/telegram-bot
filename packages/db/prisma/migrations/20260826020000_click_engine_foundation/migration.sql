-- Phase 3: server-confirmed clicks, integer microcoin accounting and
-- concurrency-safe daily counters.
ALTER TYPE "CoinTransactionType" ADD VALUE 'CLICK_REWARD';

CREATE TYPE "ClickEventStatus" AS ENUM ('ACCEPTED', 'REJECTED');
CREATE TYPE "ClickRejectionCode" AS ENUM (
  'COOLDOWN',
  'DAILY_LIMIT',
  'SESSION_NOT_REWARDABLE',
  'SESSION_INACTIVE',
  'USER_INELIGIBLE',
  'RISK_REJECTED'
);

ALTER TABLE "Wallet"
  ADD COLUMN "lockedBalance" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "pendingBalance" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "CoinTransaction"
  ADD COLUMN "clickEventId" TEXT;

CREATE TABLE "ClickEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activitySessionId" TEXT NOT NULL,
  "status" "ClickEventStatus" NOT NULL,
  "rejectionCode" "ClickRejectionCode",
  "rewardAmount" BIGINT NOT NULL DEFAULT 0,
  "clickDate" DATE NOT NULL,
  "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClickDailyCounter" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clickDate" DATE NOT NULL,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "totalReward" BIGINT NOT NULL DEFAULT 0,
  "lastAcceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClickDailyCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoinTransaction_clickEventId_key" ON "CoinTransaction"("clickEventId");
CREATE INDEX "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt");
CREATE INDEX "CoinTransaction_walletId_createdAt_idx" ON "CoinTransaction"("walletId", "createdAt");
CREATE UNIQUE INDEX "ClickEvent_requestId_key" ON "ClickEvent"("requestId");
CREATE INDEX "ClickEvent_userId_clickDate_status_idx" ON "ClickEvent"("userId", "clickDate", "status");
CREATE INDEX "ClickEvent_activitySessionId_serverReceivedAt_idx" ON "ClickEvent"("activitySessionId", "serverReceivedAt");
CREATE INDEX "ClickEvent_serverReceivedAt_idx" ON "ClickEvent"("serverReceivedAt");
CREATE UNIQUE INDEX "ClickDailyCounter_userId_clickDate_key" ON "ClickDailyCounter"("userId", "clickDate");
CREATE INDEX "ClickDailyCounter_clickDate_acceptedCount_idx" ON "ClickDailyCounter"("clickDate", "acceptedCount");

ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_clickEventId_fkey"
  FOREIGN KEY ("clickEventId") REFERENCES "ClickEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_activitySessionId_fkey"
  FOREIGN KEY ("activitySessionId") REFERENCES "ActivitySession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClickDailyCounter" ADD CONSTRAINT "ClickDailyCounter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balances_nonnegative"
  CHECK ("balance" >= 0 AND "lockedBalance" >= 0 AND "pendingBalance" >= 0);
ALTER TABLE "ClickDailyCounter" ADD CONSTRAINT "ClickDailyCounter_values_nonnegative"
  CHECK ("acceptedCount" >= 0 AND "totalReward" >= 0);
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_reward_nonnegative"
  CHECK ("rewardAmount" >= 0);
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_outcome_consistent" CHECK (
  ("status" = 'ACCEPTED' AND "rejectionCode" IS NULL AND "acceptedAt" IS NOT NULL AND "rewardAmount" > 0)
  OR
  ("status" = 'REJECTED' AND "rejectionCode" IS NOT NULL AND "acceptedAt" IS NULL AND "rewardAmount" = 0)
);

-- Click attempts and ledger rows are historical facts. Corrections must be
-- represented by compensating rows, never by rewriting or deleting history.
CREATE FUNCTION "reject_immutable_financial_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ClickEvent_append_only"
BEFORE UPDATE OR DELETE ON "ClickEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_financial_mutation"();

CREATE TRIGGER "CoinTransaction_append_only"
BEFORE UPDATE OR DELETE ON "CoinTransaction"
FOR EACH ROW EXECUTE FUNCTION "reject_immutable_financial_mutation"();
