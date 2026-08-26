-- Phase 5: reward request state machine, provider delivery records and
-- concurrency-safe daily/global reward budgets.
ALTER TYPE "CoinTransactionType" ADD VALUE 'REWARD_LOCK';
ALTER TYPE "CoinTransactionType" ADD VALUE 'REWARD_REFUND';
ALTER TYPE "CoinTransactionType" ADD VALUE 'REWARD_REDEEM';

CREATE TYPE "RewardRequestStatus" AS ENUM ('REQUESTED', 'RISK_CHECK', 'APPROVED', 'QUEUED', 'SENDING', 'PAID', 'REVIEW_REQUIRED', 'FAILED', 'REJECTED', 'REFUNDED');
CREATE TYPE "RewardProviderType" AS ENUM ('TEST', 'MANUAL');
CREATE TYPE "RewardTransactionStatus" AS ENUM ('CREATED', 'SENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "RewardBudgetPoolType" AS ENUM ('USER_REWARD', 'DISPUTE', 'TEST', 'EMERGENCY');

CREATE TABLE "RewardRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "requestDate" DATE NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "RewardRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "coinAmount" BIGINT NOT NULL DEFAULT 100000,
  "rewardUnits" INTEGER NOT NULL DEFAULT 10,
  "providerType" "RewardProviderType" NOT NULL DEFAULT 'TEST',
  "failureCode" TEXT,
  "failureReason" TEXT,
  "metadata" JSONB,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "riskCheckedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3),
  "sendingAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RewardRequest_amounts_positive" CHECK ("coinAmount" > 0 AND "rewardUnits" > 0)
);

CREATE TABLE "RewardTransaction" (
  "id" TEXT NOT NULL,
  "rewardRequestId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "providerType" "RewardProviderType" NOT NULL,
  "status" "RewardTransactionStatus" NOT NULL DEFAULT 'CREATED',
  "rewardUnits" INTEGER NOT NULL,
  "providerReference" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sendingAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RewardTransaction_values_nonnegative" CHECK ("rewardUnits" > 0 AND "attemptCount" >= 0)
);

CREATE TABLE "RewardRequestTransition" (
  "id" TEXT NOT NULL,
  "rewardRequestId" TEXT NOT NULL,
  "fromStatus" "RewardRequestStatus",
  "toStatus" "RewardRequestStatus" NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardRequestTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardBudget" (
  "id" TEXT NOT NULL,
  "budgetDate" DATE NOT NULL,
  "dailyLimit" INTEGER NOT NULL DEFAULT 50,
  "reservedUnits" INTEGER NOT NULL DEFAULT 0,
  "paidUnits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardBudget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RewardBudget_values_valid" CHECK ("dailyLimit" >= 0 AND "reservedUnits" >= 0 AND "paidUnits" >= 0 AND "reservedUnits" + "paidUnits" <= "dailyLimit")
);

CREATE TABLE "RewardBudgetPool" (
  "id" TEXT NOT NULL,
  "type" "RewardBudgetPoolType" NOT NULL,
  "allocatedUnits" INTEGER NOT NULL,
  "reservedUnits" INTEGER NOT NULL DEFAULT 0,
  "spentUnits" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardBudgetPool_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RewardBudgetPool_values_valid" CHECK ("allocatedUnits" >= 0 AND "reservedUnits" >= 0 AND "spentUnits" >= 0 AND "reservedUnits" + "spentUnits" <= "allocatedUnits")
);

CREATE TABLE "SystemSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CoinTransaction" ADD COLUMN "rewardRequestId" TEXT;

CREATE UNIQUE INDEX "RewardRequest_idempotencyKey_key" ON "RewardRequest"("idempotencyKey");
CREATE UNIQUE INDEX "RewardRequest_userId_requestDate_key" ON "RewardRequest"("userId", "requestDate");
CREATE INDEX "RewardRequest_status_requestedAt_idx" ON "RewardRequest"("status", "requestedAt");
CREATE INDEX "RewardRequest_walletId_status_idx" ON "RewardRequest"("walletId", "status");
CREATE UNIQUE INDEX "RewardTransaction_rewardRequestId_key" ON "RewardTransaction"("rewardRequestId");
CREATE UNIQUE INDEX "RewardTransaction_idempotencyKey_key" ON "RewardTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "RewardTransaction_providerReference_key" ON "RewardTransaction"("providerReference");
CREATE INDEX "RewardTransaction_status_createdAt_idx" ON "RewardTransaction"("status", "createdAt");
CREATE INDEX "RewardRequestTransition_rewardRequestId_createdAt_idx" ON "RewardRequestTransition"("rewardRequestId", "createdAt");
CREATE UNIQUE INDEX "RewardBudget_budgetDate_key" ON "RewardBudget"("budgetDate");
CREATE UNIQUE INDEX "RewardBudgetPool_type_key" ON "RewardBudgetPool"("type");
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");
CREATE INDEX "CoinTransaction_rewardRequestId_createdAt_idx" ON "CoinTransaction"("rewardRequestId", "createdAt");
CREATE UNIQUE INDEX "CoinTransaction_rewardRequestId_type_key" ON "CoinTransaction"("rewardRequestId", "type");

ALTER TABLE "RewardRequest" ADD CONSTRAINT "RewardRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardRequest" ADD CONSTRAINT "RewardRequest_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_rewardRequestId_fkey" FOREIGN KEY ("rewardRequestId") REFERENCES "RewardRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardRequestTransition" ADD CONSTRAINT "RewardRequestTransition_rewardRequestId_fkey" FOREIGN KEY ("rewardRequestId") REFERENCES "RewardRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_rewardRequestId_fkey" FOREIGN KEY ("rewardRequestId") REFERENCES "RewardRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_reward_transition_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RewardRequestTransition_append_only" BEFORE UPDATE OR DELETE ON "RewardRequestTransition" FOR EACH ROW EXECUTE FUNCTION "reject_reward_transition_mutation"();

INSERT INTO "RewardBudgetPool" ("id", "type", "allocatedUnits", "updatedAt") VALUES
  ('phase5-user-reward', 'USER_REWARD', 3500, CURRENT_TIMESTAMP),
  ('phase5-dispute', 'DISPUTE', 750, CURRENT_TIMESTAMP),
  ('phase5-test', 'TEST', 500, CURRENT_TIMESTAMP),
  ('phase5-emergency', 'EMERGENCY', 250, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("id", "key", "value", "updatedAt") VALUES
  ('phase5-payout-pause', 'reward.payoutPaused', 'false'::jsonb, CURRENT_TIMESTAMP),
  ('phase5-coin-cost', 'reward.coinCostMicrocoin', '100000'::jsonb, CURRENT_TIMESTAMP),
  ('phase5-reward-units', 'reward.unitsPerRequest', '10'::jsonb, CURRENT_TIMESTAMP),
  ('phase5-daily-limit', 'reward.dailyLimitUnits', '50'::jsonb, CURRENT_TIMESTAMP);
