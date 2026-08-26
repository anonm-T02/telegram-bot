-- Phase 4: referral milestones, quality-release queue and risk engine.
ALTER TYPE "CoinTransactionType" ADD VALUE 'REFERRAL_MILESTONE_REWARD';
ALTER TYPE "ReferralStatus" ADD VALUE 'ACTIVE';
ALTER TYPE "ReferralStatus" ADD VALUE 'QUALITY_QUEUED';
ALTER TYPE "ReferralStatus" ADD VALUE 'QUALIFIED';
ALTER TYPE "ReferralStatus" ADD VALUE 'REJECTED';

CREATE TYPE "ReferralMilestoneType" AS ENUM (
  'REFERRER_REGISTER', 'REFERRER_ACTIVE_3_DAYS',
  'REFERRER_QUALITY_7_DAYS', 'REFERRED_USER_QUALITY'
);
CREATE TYPE "ReferralMilestoneStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'QUEUED', 'RELEASED', 'REJECTED');
CREATE TYPE "FraudSignalType" AS ENUM (
  'SHARED_IP', 'SHARED_DEVICE', 'IMPOSSIBLE_ACTIVITY', 'CLICK_PATTERN',
  'REFERRAL_CLUSTER', 'SESSION_ANOMALY', 'MANUAL'
);
CREATE TYPE "FraudSignalStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "RiskLevel" AS ENUM ('NORMAL', 'WATCH', 'REVIEW_REQUIRED', 'TEMPORARY_REWARD_HOLD');

ALTER TABLE "Referral"
  ADD COLUMN "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "activeDayCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "activeSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "validClickCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "qualityQualifiedAt" TIMESTAMP(3),
  ADD COLUMN "riskCheckedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ReferralLink" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ReferralLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReferralMilestone" (
  "id" TEXT NOT NULL, "referralId" TEXT NOT NULL, "beneficiaryId" TEXT NOT NULL,
  "type" "ReferralMilestoneType" NOT NULL,
  "status" "ReferralMilestoneStatus" NOT NULL DEFAULT 'PENDING',
  "amount" BIGINT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "eligibleAt" TIMESTAMP(3), "queuedAt" TIMESTAMP(3), "releaseDate" DATE,
  "releasedAt" TIMESTAMP(3), "rejectedAt" TIMESTAMP(3), "rejectionReason" TEXT,
  "transactionId" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralMilestone_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReferralReleaseCounter" (
  "id" TEXT NOT NULL, "referrerId" TEXT NOT NULL, "releaseDate" DATE NOT NULL,
  "releasedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralReleaseCounter_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FraudSignal" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" "FraudSignalType" NOT NULL,
  "status" "FraudSignalStatus" NOT NULL DEFAULT 'OPEN', "weight" INTEGER NOT NULL,
  "source" TEXT NOT NULL, "fingerprint" TEXT, "metadata" JSONB,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "FraudSignal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RiskScore" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "score" INTEGER NOT NULL DEFAULT 0,
  "level" "RiskLevel" NOT NULL DEFAULT 'NORMAL', "reasons" JSONB,
  "modelVersion" TEXT NOT NULL, "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "holdUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiskScore_pkey" PRIMARY KEY ("id")
);

-- Preserve existing deep-link codes and already-paid legacy register rewards.
INSERT INTO "ReferralLink" ("id", "userId", "code", "createdAt")
SELECT 'rl_' || md5("id"), "id", "referralCode", "createdAt" FROM "User";
INSERT INTO "ReferralMilestone" (
  "id", "referralId", "beneficiaryId", "type", "status", "amount",
  "idempotencyKey", "eligibleAt", "releasedAt", "createdAt", "updatedAt", "metadata"
)
SELECT 'rm_' || md5(r."id" || ':register'), r."id", r."referrerUserId",
  'REFERRER_REGISTER',
  CASE WHEN r."status" = 'REWARDED' THEN 'RELEASED'::"ReferralMilestoneStatus"
       ELSE 'PENDING'::"ReferralMilestoneStatus" END,
  CASE WHEN r."reward" > 0 THEN r."reward" ELSE 500 END,
  'referral:' || r."id" || ':referrer_register',
  CASE WHEN r."status" = 'REWARDED' THEN r."createdAt" ELSE NULL END,
  CASE WHEN r."status" = 'REWARDED' THEN r."createdAt" ELSE NULL END,
  r."createdAt", CURRENT_TIMESTAMP,
  jsonb_build_object('legacyBackfill', true, 'legacyReward', r."reward")
FROM "Referral" r;

CREATE UNIQUE INDEX "ReferralLink_userId_key" ON "ReferralLink"("userId");
CREATE UNIQUE INDEX "ReferralLink_code_key" ON "ReferralLink"("code");
CREATE INDEX "ReferralLink_code_isActive_idx" ON "ReferralLink"("code", "isActive");
CREATE UNIQUE INDEX "ReferralMilestone_idempotencyKey_key" ON "ReferralMilestone"("idempotencyKey");
CREATE UNIQUE INDEX "ReferralMilestone_transactionId_key" ON "ReferralMilestone"("transactionId");
CREATE UNIQUE INDEX "ReferralMilestone_referralId_type_key" ON "ReferralMilestone"("referralId", "type");
CREATE INDEX "ReferralMilestone_beneficiaryId_status_eligibleAt_idx" ON "ReferralMilestone"("beneficiaryId", "status", "eligibleAt");
CREATE INDEX "ReferralMilestone_status_releaseDate_queuedAt_idx" ON "ReferralMilestone"("status", "releaseDate", "queuedAt");
CREATE UNIQUE INDEX "ReferralReleaseCounter_referrerId_releaseDate_key" ON "ReferralReleaseCounter"("referrerId", "releaseDate");
CREATE INDEX "ReferralReleaseCounter_releaseDate_releasedCount_idx" ON "ReferralReleaseCounter"("releaseDate", "releasedCount");
CREATE INDEX "Referral_referrerUserId_status_createdAt_idx" ON "Referral"("referrerUserId", "status", "createdAt");
CREATE INDEX "Referral_status_qualityQualifiedAt_idx" ON "Referral"("status", "qualityQualifiedAt");
CREATE INDEX "FraudSignal_userId_status_detectedAt_idx" ON "FraudSignal"("userId", "status", "detectedAt");
CREATE INDEX "FraudSignal_type_fingerprint_detectedAt_idx" ON "FraudSignal"("type", "fingerprint", "detectedAt");
CREATE INDEX "FraudSignal_status_expiresAt_idx" ON "FraudSignal"("status", "expiresAt");
CREATE UNIQUE INDEX "RiskScore_userId_key" ON "RiskScore"("userId");
CREATE INDEX "RiskScore_level_score_calculatedAt_idx" ON "RiskScore"("level", "score", "calculatedAt");

ALTER TABLE "ReferralLink" ADD CONSTRAINT "ReferralLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralMilestone" ADD CONSTRAINT "ReferralMilestone_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralMilestone" ADD CONSTRAINT "ReferralMilestone_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralMilestone" ADD CONSTRAINT "ReferralMilestone_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "CoinTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReleaseCounter" ADD CONSTRAINT "ReferralReleaseCounter_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiskScore" ADD CONSTRAINT "RiskScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Referral" ADD CONSTRAINT "Referral_progress_nonnegative" CHECK ("activeDayCount" >= 0 AND "activeSeconds" >= 0 AND "validClickCount" >= 0 AND "reward" >= 0);
ALTER TABLE "ReferralMilestone" ADD CONSTRAINT "ReferralMilestone_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ReferralMilestone" ADD CONSTRAINT "ReferralMilestone_state_consistent" CHECK (
  ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL) OR
  ("status" = 'REJECTED' AND "rejectedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL) OR
  ("status" NOT IN ('RELEASED', 'REJECTED') AND "releasedAt" IS NULL AND "rejectedAt" IS NULL)
);
ALTER TABLE "ReferralReleaseCounter" ADD CONSTRAINT "ReferralReleaseCounter_range" CHECK ("releasedCount" BETWEEN 0 AND 5);
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_weight_range" CHECK ("weight" BETWEEN -100 AND 100);
ALTER TABLE "RiskScore" ADD CONSTRAINT "RiskScore_score_range" CHECK ("score" BETWEEN 0 AND 100);

