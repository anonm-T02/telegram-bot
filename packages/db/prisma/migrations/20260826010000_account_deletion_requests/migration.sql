CREATE TYPE "AccountDeletionRequestStatus" AS ENUM ('PENDING', 'CANCELLED', 'COMPLETED');

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountDeletionRequest_userId_status_requestedAt_idx"
ON "AccountDeletionRequest"("userId", "status", "requestedAt");

-- Repeated and concurrent submissions share one pending workflow.
CREATE UNIQUE INDEX "AccountDeletionRequest_one_pending_per_user"
ON "AccountDeletionRequest"("userId") WHERE "status" = 'PENDING';

ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_reason_length"
CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 500);
