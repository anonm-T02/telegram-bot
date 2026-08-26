-- Integrated Phase 8: explicit revocable CPU consent and allowlisted,
-- deterministic benchmark accounting. No executable/code/URL fields exist.
CREATE TYPE "CpuConsentStatus" AS ENUM ('GRANTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "CpuConsentAction" AS ENUM ('GRANT', 'REVOKE');
CREATE TYPE "CpuSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED', 'EXPIRED', 'CONSENT_REVOKED', 'HIDDEN_STOP', 'THERMAL_STOP', 'RESOURCE_STOP');
CREATE TYPE "ThermalState" AS ENUM ('UNKNOWN', 'NOMINAL', 'WARM', 'HOT', 'CRITICAL');
CREATE TYPE "ComputeTaskType" AS ENUM ('INTEGER_MIX_V1');
CREATE TYPE "ComputeTaskStatus" AS ENUM ('ISSUED', 'COMPLETED', 'EXPIRED', 'REJECTED');
CREATE TYPE "ComputeValidationStatus" AS ENUM ('ACCEPTED', 'INVALID_SIGNATURE', 'EXPIRED', 'REPLAYED', 'WRONG_OUTPUT', 'RESOURCE_LIMIT', 'SESSION_INACTIVE', 'CONSENT_INACTIVE');

CREATE TABLE "CpuConsent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientInstanceHash" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "status" "CpuConsentStatus" NOT NULL DEFAULT 'GRANTED',
  "maxWorkers" INTEGER NOT NULL DEFAULT 1,
  "maxDutyCyclePct" INTEGER NOT NULL DEFAULT 25,
  "maxTaskSeconds" INTEGER NOT NULL DEFAULT 15,
  "allowOnBattery" BOOLEAN NOT NULL DEFAULT false,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CpuConsent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CpuConsent_limits_valid" CHECK ("maxWorkers" BETWEEN 1 AND 2 AND "maxDutyCyclePct" BETWEEN 1 AND 50 AND "maxTaskSeconds" BETWEEN 1 AND 30),
  CONSTRAINT "CpuConsent_expiry_valid" CHECK ("expiresAt" > "grantedAt"),
  CONSTRAINT "CpuConsent_status_valid" CHECK (("status" = 'GRANTED' AND "revokedAt" IS NULL) OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL) OR "status" = 'EXPIRED')
);

CREATE TABLE "CpuConsentEvent" (
  "id" TEXT NOT NULL,
  "consentId" TEXT NOT NULL,
  "action" "CpuConsentAction" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CpuConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CpuSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "consentId" TEXT NOT NULL,
  "status" "CpuSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "userInitiated" BOOLEAN NOT NULL DEFAULT true,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "maxWorkers" INTEGER NOT NULL,
  "maxDutyCyclePct" INTEGER NOT NULL,
  "maxTaskSeconds" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "cooldownEligibleAt" TIMESTAMP(3),
  "stopReason" TEXT,
  "issuedTaskCount" INTEGER NOT NULL DEFAULT 0,
  "completedTaskCount" INTEGER NOT NULL DEFAULT 0,
  "validatedWorkUnits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CpuSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CpuSession_explicit_start" CHECK ("userInitiated" = true),
  CONSTRAINT "CpuSession_limits_valid" CHECK ("maxWorkers" BETWEEN 1 AND 2 AND "maxDutyCyclePct" BETWEEN 1 AND 50 AND "maxTaskSeconds" BETWEEN 1 AND 30),
  CONSTRAINT "CpuSession_duration_valid" CHECK ("expiresAt" > "startedAt" AND "expiresAt" <= "startedAt" + INTERVAL '10 minutes'),
  CONSTRAINT "CpuSession_counts_valid" CHECK ("issuedTaskCount" >= 0 AND "completedTaskCount" >= 0 AND "completedTaskCount" <= "issuedTaskCount" AND "validatedWorkUnits" >= 0),
  CONSTRAINT "CpuSession_end_valid" CHECK (("status" IN ('ACTIVE','PAUSED') AND "endedAt" IS NULL AND "cooldownEligibleAt" IS NULL) OR ("status" NOT IN ('ACTIVE','PAUSED') AND "endedAt" IS NOT NULL AND "cooldownEligibleAt" >= "endedAt" + INTERVAL '2 minutes')),
  CONSTRAINT "CpuSession_visibility_valid" CHECK ("status" <> 'ACTIVE' OR "isVisible" = true)
);

CREATE TABLE "CpuSessionObservation" (
  "id" TEXT NOT NULL,
  "cpuSessionId" TEXT NOT NULL,
  "isVisible" BOOLEAN NOT NULL,
  "workerCount" INTEGER NOT NULL,
  "dutyCyclePct" INTEGER NOT NULL,
  "thermalState" "ThermalState" NOT NULL DEFAULT 'UNKNOWN',
  "batteryLevelPct" INTEGER,
  "isCharging" BOOLEAN,
  "clientSequence" INTEGER NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CpuSessionObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CpuSessionObservation_values_valid" CHECK ("workerCount" BETWEEN 0 AND 2 AND "dutyCyclePct" BETWEEN 0 AND 100 AND ("batteryLevelPct" IS NULL OR "batteryLevelPct" BETWEEN 0 AND 100) AND "clientSequence" >= 0)
);

CREATE TABLE "ComputeTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cpuSessionId" TEXT NOT NULL,
  "type" "ComputeTaskType" NOT NULL,
  "version" INTEGER NOT NULL,
  "nonce" TEXT NOT NULL,
  "inputSeed" TEXT NOT NULL,
  "iterations" INTEGER NOT NULL,
  "expectedDigest" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "status" "ComputeTaskStatus" NOT NULL DEFAULT 'ISSUED',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ComputeTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ComputeTask_allowlist_version" CHECK ("type" = 'INTEGER_MIX_V1' AND "version" = 1),
  CONSTRAINT "ComputeTask_iterations_valid" CHECK ("iterations" BETWEEN 1 AND 5000000),
  CONSTRAINT "ComputeTask_lifetime_valid" CHECK ("expiresAt" > "issuedAt" AND "expiresAt" <= "issuedAt" + INTERVAL '30 seconds'),
  CONSTRAINT "ComputeTask_hashes_present" CHECK (length("expectedDigest") = 64 AND length("payloadHash") = 64 AND length("signature") >= 43),
  CONSTRAINT "ComputeTask_completion_valid" CHECK (("status" = 'COMPLETED' AND "completedAt" IS NOT NULL) OR ("status" <> 'COMPLETED'))
);

CREATE TABLE "ComputeResult" (
  "id" TEXT NOT NULL,
  "computeTaskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cpuSessionId" TEXT NOT NULL,
  "outputDigest" TEXT NOT NULL,
  "elapsedMs" INTEGER NOT NULL,
  "workerCount" INTEGER NOT NULL,
  "validationStatus" "ComputeValidationStatus" NOT NULL,
  "validatedUnits" INTEGER NOT NULL DEFAULT 0,
  "evidence" JSONB,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComputeResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ComputeResult_values_valid" CHECK (length("outputDigest") = 64 AND "elapsedMs" BETWEEN 0 AND 30000 AND "workerCount" BETWEEN 1 AND 2 AND "validatedUnits" >= 0),
  CONSTRAINT "ComputeResult_outcome_valid" CHECK (("validationStatus" = 'ACCEPTED' AND "validatedUnits" > 0) OR ("validationStatus" <> 'ACCEPTED' AND "validatedUnits" = 0))
);

CREATE UNIQUE INDEX "CpuConsentEvent_idempotencyKey_key" ON "CpuConsentEvent"("idempotencyKey");
CREATE INDEX "CpuConsent_userId_status_expiresAt_idx" ON "CpuConsent"("userId", "status", "expiresAt");
CREATE INDEX "CpuConsent_clientInstanceHash_status_idx" ON "CpuConsent"("clientInstanceHash", "status");
CREATE UNIQUE INDEX "CpuConsent_one_granted_per_client" ON "CpuConsent"("userId", "clientInstanceHash") WHERE "status" = 'GRANTED';
CREATE INDEX "CpuConsentEvent_consentId_createdAt_idx" ON "CpuConsentEvent"("consentId", "createdAt");
CREATE INDEX "CpuSession_userId_status_startedAt_idx" ON "CpuSession"("userId", "status", "startedAt");
CREATE INDEX "CpuSession_consentId_status_idx" ON "CpuSession"("consentId", "status");
CREATE INDEX "CpuSession_status_lastHeartbeatAt_idx" ON "CpuSession"("status", "lastHeartbeatAt");
CREATE UNIQUE INDEX "CpuSession_one_open_per_user" ON "CpuSession"("userId") WHERE "status" IN ('ACTIVE','PAUSED');
CREATE UNIQUE INDEX "CpuSessionObservation_cpuSessionId_clientSequence_key" ON "CpuSessionObservation"("cpuSessionId", "clientSequence");
CREATE INDEX "CpuSessionObservation_cpuSessionId_receivedAt_idx" ON "CpuSessionObservation"("cpuSessionId", "receivedAt");
CREATE UNIQUE INDEX "ComputeTask_nonce_key" ON "ComputeTask"("nonce");
CREATE INDEX "ComputeTask_userId_status_expiresAt_idx" ON "ComputeTask"("userId", "status", "expiresAt");
CREATE INDEX "ComputeTask_cpuSessionId_status_issuedAt_idx" ON "ComputeTask"("cpuSessionId", "status", "issuedAt");
CREATE INDEX "ComputeTask_type_version_status_idx" ON "ComputeTask"("type", "version", "status");
CREATE UNIQUE INDEX "ComputeResult_computeTaskId_key" ON "ComputeResult"("computeTaskId");
CREATE INDEX "ComputeResult_userId_validationStatus_validatedAt_idx" ON "ComputeResult"("userId", "validationStatus", "validatedAt");
CREATE INDEX "ComputeResult_cpuSessionId_validatedAt_idx" ON "ComputeResult"("cpuSessionId", "validatedAt");

ALTER TABLE "CpuConsent" ADD CONSTRAINT "CpuConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CpuConsentEvent" ADD CONSTRAINT "CpuConsentEvent_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "CpuConsent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CpuSession" ADD CONSTRAINT "CpuSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CpuSession" ADD CONSTRAINT "CpuSession_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "CpuConsent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CpuSessionObservation" ADD CONSTRAINT "CpuSessionObservation_cpuSessionId_fkey" FOREIGN KEY ("cpuSessionId") REFERENCES "CpuSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComputeTask" ADD CONSTRAINT "ComputeTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComputeTask" ADD CONSTRAINT "ComputeTask_cpuSessionId_fkey" FOREIGN KEY ("cpuSessionId") REFERENCES "CpuSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComputeResult" ADD CONSTRAINT "ComputeResult_computeTaskId_fkey" FOREIGN KEY ("computeTaskId") REFERENCES "ComputeTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComputeResult" ADD CONSTRAINT "ComputeResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComputeResult" ADD CONSTRAINT "ComputeResult_cpuSessionId_fkey" FOREIGN KEY ("cpuSessionId") REFERENCES "CpuSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_safe_compute_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CpuConsentEvent_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "CpuConsentEvent" FOR EACH STATEMENT EXECUTE FUNCTION "reject_safe_compute_history_mutation"();
CREATE TRIGGER "CpuSessionObservation_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "CpuSessionObservation" FOR EACH STATEMENT EXECUTE FUNCTION "reject_safe_compute_history_mutation"();
CREATE TRIGGER "ComputeResult_append_only" BEFORE UPDATE OR DELETE OR TRUNCATE ON "ComputeResult" FOR EACH STATEMENT EXECUTE FUNCTION "reject_safe_compute_history_mutation"();
