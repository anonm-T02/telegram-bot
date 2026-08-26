import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client. Reused across the API/bot/worker processes to
 * avoid exhausting Postgres connections in development hot-reload.
 */
declare global {
  // eslint-disable-next-line no-var
  var __novaPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__novaPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__novaPrisma = prisma;
}

export {
  PrismaClient,
  Prisma,
  ActivitySessionStatus,
  ActivityState,
  CoinTransactionType,
  ReferralStatus,
  UserStatus,
} from "@prisma/client";
export type {
  ActivitySession,
  CoinTransaction,
  DailyClaim,
  Heartbeat,
  Referral,
  TelegramSession,
  User,
  Wallet,
} from "@prisma/client";
