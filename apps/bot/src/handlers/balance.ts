import type { CommandContext, Context } from "grammy";
import { COIN_TICKER } from "@nova-org/shared";
import { ApiError, getWallet } from "../apiClient.js";

export async function handleBalance(ctx: CommandContext<Context>): Promise<void> {
  const telegramUser = ctx.from;
  if (!telegramUser) return;

  try {
    const wallet = await getWallet(telegramUser.id);
    await ctx.reply(
      `💰 Balance: ${wallet.balance} ${COIN_TICKER}\n` +
        `Total earned: ${wallet.totalEarned} ${COIN_TICKER}\n` +
        `Total spent: ${wallet.totalSpent} ${COIN_TICKER}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await ctx.reply("Please send /start first to create your account.");
      return;
    }
    throw error;
  }
}
