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

export { PrismaClient, Prisma, CoinTransactionType, ReferralStatus } from "@prisma/client";
export type { User, Wallet, CoinTransaction, DailyClaim, Referral } from "@prisma/client";
