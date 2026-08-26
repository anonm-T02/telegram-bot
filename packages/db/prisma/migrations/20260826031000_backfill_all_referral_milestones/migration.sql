-- Corrective, idempotent backfill for referrals that predate Phase 4.
-- The first Phase 4 migration preserved the already-paid register reward;
-- these remaining obligations must also exist for the evaluator to progress.
INSERT INTO "ReferralMilestone" (
  "id", "referralId", "beneficiaryId", "type", "status", "amount",
  "idempotencyKey", "createdAt", "updatedAt", "metadata"
)
SELECT
  'rm_' || md5(r."id" || ':active_3_days'),
  r."id", r."referrerUserId", 'REFERRER_ACTIVE_3_DAYS', 'PENDING', 500,
  'referral:' || r."id" || ':referrer_active_3_days',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  jsonb_build_object('legacyBackfill', true)
FROM "Referral" r
ON CONFLICT ("referralId", "type") DO NOTHING;

INSERT INTO "ReferralMilestone" (
  "id", "referralId", "beneficiaryId", "type", "status", "amount",
  "idempotencyKey", "createdAt", "updatedAt", "metadata"
)
SELECT
  'rm_' || md5(r."id" || ':quality_7_days'),
  r."id", r."referrerUserId", 'REFERRER_QUALITY_7_DAYS', 'PENDING', 1000,
  'referral:' || r."id" || ':referrer_quality_7_days',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  jsonb_build_object('legacyBackfill', true)
FROM "Referral" r
ON CONFLICT ("referralId", "type") DO NOTHING;

INSERT INTO "ReferralMilestone" (
  "id", "referralId", "beneficiaryId", "type", "status", "amount",
  "idempotencyKey", "createdAt", "updatedAt", "metadata"
)
SELECT
  'rm_' || md5(r."id" || ':referred_user_quality'),
  r."id", r."referredUserId", 'REFERRED_USER_QUALITY', 'PENDING', 500,
  'referral:' || r."id" || ':referred_user_quality',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  jsonb_build_object('legacyBackfill', true)
FROM "Referral" r
ON CONFLICT ("referralId", "type") DO NOTHING;

