import { prisma } from "@nova-org/db";
import type { WalletResponse } from "@nova-org/shared";

export class UserNotFoundError extends Error {
  constructor(telegramId: bigint) {
    super(`No user found for telegramId ${telegramId}`);
    this.name = "UserNotFoundError";
  }
}

export async function getWalletByTelegramId(telegramId: bigint): Promise<WalletResponse> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { wallet: true },
  });

  if (!user || !user.wallet) {
    throw new UserNotFoundError(telegramId);
  }

  return {
    balance: user.wallet.balance,
    totalEarned: user.wallet.totalEarned,
    totalSpent: user.wallet.totalSpent,
  };
}
