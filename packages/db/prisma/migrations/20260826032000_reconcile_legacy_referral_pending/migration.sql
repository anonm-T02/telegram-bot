-- One-time, auditable reconciliation of pending balances for legacy referral
-- obligations. CoinTransaction is intentionally not used: no available coin
-- is earned here; this only restores the pending liability bucket.
CREATE TABLE "ReferralPendingReconciliation" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "outstandingObligation" BIGINT NOT NULL,
  "balanceBefore" BIGINT NOT NULL,
  "amountApplied" BIGINT NOT NULL,
  "balanceAfter" BIGINT NOT NULL,
  "migrationKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralPendingReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralPendingReconciliation_walletId_key"
  ON "ReferralPendingReconciliation"("walletId");
CREATE UNIQUE INDEX "ReferralPendingReconciliation_migrationKey_key"
  ON "ReferralPendingReconciliation"("migrationKey");
CREATE INDEX "ReferralPendingReconciliation_createdAt_idx"
  ON "ReferralPendingReconciliation"("createdAt");
ALTER TABLE "ReferralPendingReconciliation"
  ADD CONSTRAINT "ReferralPendingReconciliation_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralPendingReconciliation"
  ADD CONSTRAINT "ReferralPendingReconciliation_values_nonnegative" CHECK (
    "outstandingObligation" >= 0 AND "balanceBefore" >= 0 AND
    "amountApplied" >= 0 AND "balanceAfter" >= 0 AND
    "balanceAfter" = "balanceBefore" + "amountApplied"
  );

-- pendingBalance currently has a single producer: referral register/3-day
-- obligations. New Phase 4 referrals already increment it in the API. Taking
-- only the positive deficit between all outstanding obligations and the
-- current bucket prevents those amounts from being counted twice.
WITH legacy_wallets AS (
  SELECT DISTINCT w."id" AS "walletId"
  FROM "Wallet" w
  JOIN "ReferralMilestone" legacy ON legacy."beneficiaryId" = w."userId"
  WHERE legacy."type" IN ('REFERRER_REGISTER', 'REFERRER_ACTIVE_3_DAYS')
    AND legacy."status" IN ('PENDING', 'ELIGIBLE', 'QUEUED')
    AND legacy."metadata" @> '{"legacyBackfill": true}'::jsonb
), outstanding AS (
  SELECT w."id" AS "walletId", w."pendingBalance" AS "balanceBefore",
    COALESCE(SUM(m."amount"), 0)::bigint AS "outstandingObligation"
  FROM "Wallet" w
  JOIN legacy_wallets lw ON lw."walletId" = w."id"
  LEFT JOIN "ReferralMilestone" m ON m."beneficiaryId" = w."userId"
    AND m."type" IN ('REFERRER_REGISTER', 'REFERRER_ACTIVE_3_DAYS')
    AND m."status" IN ('PENDING', 'ELIGIBLE', 'QUEUED')
  GROUP BY w."id", w."pendingBalance"
), audit_rows AS (
  INSERT INTO "ReferralPendingReconciliation" (
    "id", "walletId", "outstandingObligation", "balanceBefore",
    "amountApplied", "balanceAfter", "migrationKey", "metadata"
  )
  SELECT
    'rpr_' || md5(o."walletId" || ':phase4-legacy-pending-v1'),
    o."walletId", o."outstandingObligation", o."balanceBefore",
    GREATEST(o."outstandingObligation" - o."balanceBefore", 0),
    o."balanceBefore" + GREATEST(o."outstandingObligation" - o."balanceBefore", 0),
    'phase4-legacy-pending-v1:' || o."walletId",
    jsonb_build_object(
      'strategy', 'positive-deficit',
      'includedTypes', jsonb_build_array('REFERRER_REGISTER', 'REFERRER_ACTIVE_3_DAYS')
    )
  FROM outstanding o
  ON CONFLICT ("walletId") DO NOTHING
  RETURNING "walletId", "amountApplied"
)
UPDATE "Wallet" w
SET "pendingBalance" = w."pendingBalance" + a."amountApplied",
    "updatedAt" = CURRENT_TIMESTAMP
FROM audit_rows a
WHERE w."id" = a."walletId" AND a."amountApplied" > 0;

