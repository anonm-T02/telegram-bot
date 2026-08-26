import { Prisma, prisma } from "@nova-org/db";
import type { DailyRewardResponse } from "@nova-org/shared";
import { env } from "../env.js";
import { UserNotFoundError } from "./wallet.js";

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Grants the daily reward at most once per user per UTC day. The
 * `(userId, claimDate)` unique constraint on `DailyClaim` is what makes
 * this safe against duplicate/concurrent requests — the reward is only
 * ever written once the row insert succeeds.
 */
export async function claimDailyReward(telegramId: bigint): Promise<DailyRewardResponse> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { wallet: true },
  });

  if (!user || !user.wallet) {
    throw new UserNotFoundError(telegramId);
  }

  const amount = env.DAILY_REWARD_AMOUNT;
  const claimDate = todayUtc();

  try {
    const wallet = await prisma.$transaction(async (tx) => {
      await tx.dailyClaim.create({
        data: { userId: user.id, claimDate, amount },
      });

      const updatedWallet = await tx.wallet.update({
        where: { userId: user.id },
        data: { balance: { increment: amount }, totalEarned: { increment: amount } },
      });

      await tx.coinTransaction.create({
        data: {
          userId: user.id,
          walletId: updatedWallet.id,
          type: "DAILY_REWARD",
          amount,
        },
      });

      return updatedWallet;
    });

    return { claimed: true, alreadyClaimedToday: false, amount, balance: wallet.balance };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        claimed: false,
        alreadyClaimedToday: true,
        amount,
        balance: user.wallet.balance,
      };
    }
    throw error;
  }
}
