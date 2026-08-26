CREATE TYPE "AdminLoginChallengeStatus" AS ENUM ('PENDING', 'APPROVED', 'CONSUMED', 'EXPIRED');

CREATE TABLE "AdminLoginChallenge" (
  "id" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "status" "AdminLoginChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "approvedByUserId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminLoginChallenge_status_expiresAt_idx" ON "AdminLoginChallenge"("status", "expiresAt");
CREATE INDEX "AdminLoginChallenge_approvedByUserId_createdAt_idx" ON "AdminLoginChallenge"("approvedByUserId", "createdAt");
ALTER TABLE "AdminLoginChallenge" ADD CONSTRAINT "AdminLoginChallenge_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
