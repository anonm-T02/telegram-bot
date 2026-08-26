-- Close milestones that can never be evaluated because their parent referral
-- is already terminal, and reverse only the safely attributable reconciliation
-- delta. Existing valid pending obligations are always preserved.
CREATE TABLE "ReferralPendingReversal" (
  "id" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "phantomObligation" BIGINT NOT NULL,
  "validOutstanding" BIGINT NOT NULL,
  "balanceBefore" BIGINT NOT NULL,
  "amountReversed" BIGINT NOT NULL,
  "balanceAfter" BIGINT NOT NULL,
  "migrationKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralPendingReversal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralPendingReversal_reconciliationId_key"
  ON "ReferralPendingReversal"("reconciliationId");
CREATE UNIQUE INDEX "ReferralPendingReversal_migrationKey_key"
  ON "ReferralPendingReversal"("migrationKey");
CREATE INDEX "ReferralPendingReversal_walletId_createdAt_idx"
  ON "ReferralPendingReversal"("walletId", "createdAt");
ALTER TABLE "ReferralPendingReversal"
  ADD CONSTRAINT "ReferralPendingReversal_reconciliationId_fkey"
  FOREIGN KEY ("reconciliationId") REFERENCES "ReferralPendingReconciliation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralPendingReversal"
  ADD CONSTRAINT "ReferralPendingReversal_values_nonnegative" CHECK (
    "phantomObligation" >= 0 AND "validOutstanding" >= 0 AND
    "balanceBefore" >= 0 AND "amountReversed" >= 0 AND "balanceAfter" >= 0 AND
    "balanceAfter" = "balanceBefore" - "amountReversed" AND
    "balanceAfter" >= "validOutstanding"
  );

WITH terminal_phantom AS (
  SELECT w."id" AS "walletId", COALESCE(SUM(m."amount"), 0)::bigint AS phantom
  FROM "Wallet" w
  JOIN "ReferralMilestone" m ON m."beneficiaryId" = w."userId"
  JOIN "Referral" r ON r."id" = m."referralId"
  WHERE r."status" IN ('REWARDED', 'REJECTED')
    AND m."type" IN ('REFERRER_REGISTER', 'REFERRER_ACTIVE_3_DAYS')
    AND m."status" IN ('PENDING', 'ELIGIBLE', 'QUEUED')
  GROUP BY w."id"
), valid_pending AS (
  SELECT w."id" AS "walletId", COALESCE(SUM(m."amount"), 0)::bigint AS valid
  FROM "Wallet" w
  LEFT JOIN "ReferralMilestone" m ON m."beneficiaryId" = w."userId"
    AND m."type" IN ('REFERRER_REGISTER', 'REFERRER_ACTIVE_3_DAYS')
    AND m."status" IN ('PENDING', 'ELIGIBLE', 'QUEUED')
  LEFT JOIN "Referral" r ON r."id" = m."referralId"
  WHERE m."id" IS NULL OR r."status" NOT IN ('REWARDED', 'REJECTED')
  GROUP BY w."id"
), candidates AS (
  SELECT rec."id" AS "reconciliationId", rec."walletId", tp.phantom,
    COALESCE(vp.valid, 0)::bigint AS valid,
    w."pendingBalance" AS balance_before,
    LEAST(
      rec."amountApplied",
      tp.phantom,
      GREATEST(w."pendingBalance" - COALESCE(vp.valid, 0), 0)
    )::bigint AS reverse_amount
  FROM "ReferralPendingReconciliation" rec
  JOIN "Wallet" w ON w."id" = rec."walletId"
  JOIN terminal_phantom tp ON tp."walletId" = rec."walletId"
  LEFT JOIN valid_pending vp ON vp."walletId" = rec."walletId"
), audit_rows AS (
  INSERT INTO "ReferralPendingReversal" (
    "id", "reconciliationId", "walletId", "phantomObligation",
    "validOutstanding", "balanceBefore", "amountReversed", "balanceAfter",
    "migrationKey", "metadata"
  )
  SELECT 'rprv_' || md5(c."walletId" || ':phase4-terminal-phantom-v1'),
    c."reconciliationId", c."walletId", c.phantom, c.valid,
    c.balance_before, c.reverse_amount, c.balance_before - c.reverse_amount,
    'phase4-terminal-phantom-v1:' || c."walletId",
    jsonb_build_object(
      'strategy', 'bounded-attributable-reversal',
      'reconciliationAmountApplied', rec."amountApplied"
    )
  FROM candidates c
  JOIN "ReferralPendingReconciliation" rec ON rec."id" = c."reconciliationId"
  ON CONFLICT ("reconciliationId") DO NOTHING
  RETURNING "walletId", "amountReversed"
), wallet_updates AS (
  UPDATE "Wallet" w
  SET "pendingBalance" = GREATEST(w."pendingBalance" - a."amountReversed", 0),
      "updatedAt" = CURRENT_TIMESTAMP
  FROM audit_rows a
  WHERE w."id" = a."walletId" AND a."amountReversed" > 0
  RETURNING w."id"
)
UPDATE "ReferralMilestone" m
SET "status" = 'REJECTED',
    "rejectedAt" = CURRENT_TIMESTAMP,
    "rejectionReason" = 'legacy_terminal_referral',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Referral" r
WHERE r."id" = m."referralId"
  AND r."status" IN ('REWARDED', 'REJECTED')
  AND m."status" IN ('PENDING', 'ELIGIBLE', 'QUEUED');

