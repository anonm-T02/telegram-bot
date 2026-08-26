CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'REVIEWER');
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'REVIEWER',
  "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUser_userId_key" ON "AdminUser"("userId");
CREATE UNIQUE INDEX "AdminAuditLog_idempotencyKey_key" ON "AdminAuditLog"("idempotencyKey");
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");
CREATE INDEX "AdminAuditLog_entityType_entityId_createdAt_idx" ON "AdminAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_admin_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminAuditLog_no_update"
BEFORE UPDATE ON "AdminAuditLog"
FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();

CREATE TRIGGER "AdminAuditLog_no_delete"
BEFORE DELETE ON "AdminAuditLog"
FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();
