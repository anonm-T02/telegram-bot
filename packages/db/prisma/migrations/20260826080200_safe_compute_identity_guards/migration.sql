-- Cross-table safety invariants that ordinary foreign keys cannot express.
CREATE FUNCTION "guard_cpu_session_consent"() RETURNS trigger AS $$
DECLARE
  consent_row "CpuConsent"%ROWTYPE;
BEGIN
  SELECT * INTO consent_row FROM "CpuConsent" WHERE id = NEW."consentId" FOR SHARE;
  IF NOT FOUND OR consent_row."userId" <> NEW."userId"
     OR consent_row.status <> 'GRANTED' OR consent_row."expiresAt" <= NEW."startedAt" THEN
    RAISE EXCEPTION 'active explicit consent does not match CPU session' USING ERRCODE = '23514';
  END IF;
  IF NEW."maxWorkers" > consent_row."maxWorkers"
     OR NEW."maxDutyCyclePct" > consent_row."maxDutyCyclePct"
     OR NEW."maxTaskSeconds" > consent_row."maxTaskSeconds" THEN
    RAISE EXCEPTION 'CPU session exceeds consent limits' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CpuSession_consent_guard"
BEFORE INSERT ON "CpuSession"
FOR EACH ROW EXECUTE FUNCTION "guard_cpu_session_consent"();

CREATE FUNCTION "guard_compute_task_issue"() RETURNS trigger AS $$
DECLARE
  session_row "CpuSession"%ROWTYPE;
  consent_status "CpuConsentStatus";
  consent_expiry TIMESTAMP(3);
BEGIN
  SELECT * INTO session_row FROM "CpuSession" WHERE id = NEW."cpuSessionId" FOR UPDATE;
  IF NOT FOUND OR session_row."userId" <> NEW."userId"
     OR session_row.status <> 'ACTIVE' OR session_row."isVisible" = false
     OR session_row."expiresAt" <= NEW."issuedAt" THEN
    RAISE EXCEPTION 'active visible CPU session does not match task' USING ERRCODE = '23514';
  END IF;
  SELECT status, "expiresAt" INTO consent_status, consent_expiry
    FROM "CpuConsent" WHERE id = session_row."consentId" FOR SHARE;
  IF consent_status <> 'GRANTED' OR consent_expiry <= NEW."issuedAt" THEN
    RAISE EXCEPTION 'active consent required to issue task' USING ERRCODE = '23514';
  END IF;
  IF NEW."expiresAt" > NEW."issuedAt" + make_interval(secs => session_row."maxTaskSeconds") THEN
    RAISE EXCEPTION 'task exceeds session resource limit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ComputeTask_issue_guard"
BEFORE INSERT ON "ComputeTask"
FOR EACH ROW EXECUTE FUNCTION "guard_compute_task_issue"();

CREATE FUNCTION "guard_compute_result_identity"() RETURNS trigger AS $$
DECLARE
  task_user TEXT;
  task_session TEXT;
BEGIN
  SELECT "userId", "cpuSessionId" INTO task_user, task_session
    FROM "ComputeTask" WHERE id = NEW."computeTaskId" FOR SHARE;
  IF NOT FOUND OR task_user <> NEW."userId" OR task_session <> NEW."cpuSessionId" THEN
    RAISE EXCEPTION 'compute result identity does not match task' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ComputeResult_identity_guard"
BEFORE INSERT ON "ComputeResult"
FOR EACH ROW EXECUTE FUNCTION "guard_compute_result_identity"();

CREATE FUNCTION "stop_sessions_on_consent_revoke"() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'GRANTED' AND NEW.status IN ('REVOKED', 'EXPIRED') THEN
    UPDATE "CpuSession"
      SET status = CASE WHEN NEW.status = 'REVOKED' THEN 'CONSENT_REVOKED'::"CpuSessionStatus" ELSE 'EXPIRED'::"CpuSessionStatus" END,
          "isVisible" = false,
          "endedAt" = COALESCE(NEW."revokedAt", CURRENT_TIMESTAMP),
          "cooldownEligibleAt" = COALESCE(NEW."revokedAt", CURRENT_TIMESTAMP) + INTERVAL '2 minutes',
          "stopReason" = CASE WHEN NEW.status = 'REVOKED' THEN 'CONSENT_REVOKED' ELSE 'CONSENT_EXPIRED' END,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "consentId" = NEW.id AND status IN ('ACTIVE', 'PAUSED');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CpuConsent_stop_sessions"
AFTER UPDATE OF status ON "CpuConsent"
FOR EACH ROW EXECUTE FUNCTION "stop_sessions_on_consent_revoke"();
