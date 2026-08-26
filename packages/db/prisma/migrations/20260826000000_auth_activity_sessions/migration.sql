-- Phase 2: auth and activity foundations, plus 64-bit microcoin storage.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED');
CREATE TYPE "ActivityState" AS ENUM ('ONLINE', 'ACTIVE', 'IDLE', 'BACKGROUND', 'OFFLINE');
CREATE TYPE "ActivitySessionStatus" AS ENUM ('OPEN', 'CLOSED', 'EXPIRED');

ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "UserStatus"
USING CASE lower("status")
  WHEN 'active' THEN 'ACTIVE'::"UserStatus"
  WHEN 'suspended' THEN 'SUSPENDED'::"UserStatus"
  WHEN 'blocked' THEN 'BLOCKED'::"UserStatus"
  WHEN 'deleted' THEN 'DELETED'::"UserStatus"
  ELSE 'ACTIVE'::"UserStatus"
END;
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "Wallet" ALTER COLUMN "balance" TYPE BIGINT;
ALTER TABLE "Wallet" ALTER COLUMN "totalEarned" TYPE BIGINT;
ALTER TABLE "Wallet" ALTER COLUMN "totalSpent" TYPE BIGINT;
ALTER TABLE "CoinTransaction" ALTER COLUMN "amount" TYPE BIGINT;
ALTER TABLE "DailyClaim" ALTER COLUMN "amount" TYPE BIGINT;
ALTER TABLE "Referral" ALTER COLUMN "reward" TYPE BIGINT;

CREATE TABLE "TelegramSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "authenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivitySession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "telegramSessionId" TEXT,
  "state" "ActivityState" NOT NULL DEFAULT 'ONLINE',
  "status" "ActivitySessionStatus" NOT NULL DEFAULT 'OPEN',
  "isRewardable" BOOLEAN NOT NULL DEFAULT false,
  "activeSeconds" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Heartbeat" (
  "id" TEXT NOT NULL,
  "activitySessionId" TEXT NOT NULL,
  "state" "ActivityState" NOT NULL,
  "isVisible" BOOLEAN NOT NULL,
  "clientSequence" INTEGER NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramSession_tokenHash_key" ON "TelegramSession"("tokenHash");
CREATE UNIQUE INDEX "TelegramSession_refreshTokenHash_key" ON "TelegramSession"("refreshTokenHash");
CREATE INDEX "TelegramSession_userId_expiresAt_idx" ON "TelegramSession"("userId", "expiresAt");
CREATE INDEX "TelegramSession_expiresAt_idx" ON "TelegramSession"("expiresAt");
CREATE INDEX "ActivitySession_userId_status_lastHeartbeatAt_idx" ON "ActivitySession"("userId", "status", "lastHeartbeatAt");
CREATE INDEX "ActivitySession_telegramSessionId_idx" ON "ActivitySession"("telegramSessionId");
CREATE INDEX "ActivitySession_status_lastHeartbeatAt_idx" ON "ActivitySession"("status", "lastHeartbeatAt");

CREATE UNIQUE INDEX "ActivitySession_telegramSessionId_key" ON "ActivitySession"("telegramSessionId");
-- Prisma cannot express partial indexes. This closes the parallel-session race
-- at the database layer while allowing any number of non-rewardable sessions.
CREATE UNIQUE INDEX "ActivitySession_one_open_rewardable_per_user"
ON "ActivitySession"("userId") WHERE "status" = 'OPEN' AND "isRewardable" = true;
CREATE UNIQUE INDEX "Heartbeat_activitySessionId_clientSequence_key" ON "Heartbeat"("activitySessionId", "clientSequence");
CREATE INDEX "Heartbeat_activitySessionId_receivedAt_idx" ON "Heartbeat"("activitySessionId", "receivedAt");
CREATE INDEX "Heartbeat_receivedAt_idx" ON "Heartbeat"("receivedAt");

ALTER TABLE "TelegramSession" ADD CONSTRAINT "TelegramSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_telegramSessionId_fkey"
FOREIGN KEY ("telegramSessionId") REFERENCES "TelegramSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Heartbeat" ADD CONSTRAINT "Heartbeat_activitySessionId_fkey"
FOREIGN KEY ("activitySessionId") REFERENCES "ActivitySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_activeSeconds_nonnegative"
CHECK ("activeSeconds" >= 0);
ALTER TABLE "Heartbeat" ADD CONSTRAINT "Heartbeat_clientSequence_nonnegative"
CHECK ("clientSequence" >= 0);
