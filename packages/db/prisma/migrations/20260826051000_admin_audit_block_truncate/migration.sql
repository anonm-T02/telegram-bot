-- Complete the append-only invariant. Row triggers do not fire for TRUNCATE,
-- so protect the administrative audit history with a statement trigger too.
CREATE TRIGGER "AdminAuditLog_no_truncate"
BEFORE TRUNCATE ON "AdminAuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION reject_admin_audit_mutation();
