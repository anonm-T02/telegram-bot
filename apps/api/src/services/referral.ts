import { prisma } from "@nova-org/db";
import type { ReferralStatsResponse } from "@nova-org/shared";
import { UserNotFoundError } from "./wallet.js";

export async function getReferralStats(telegramId: bigint): Promise<ReferralStatsResponse> {
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    throw new UserNotFoundError(telegramId);
  }

  const [invitedCount, rewardAggregate] = await Promise.all([
    prisma.referral.count({ where: { referrerUserId: user.id } }),
    prisma.referral.aggregate({
      where: { referrerUserId: user.id },
      _sum: { reward: true },
    }),
  ]);

  return {
    referralCode: user.referralCode,
    invitedCount,
    totalEarned: rewardAggregate._sum.reward ?? 0,
  };
}
