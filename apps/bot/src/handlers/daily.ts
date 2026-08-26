import type { CommandContext, Context } from "grammy";
import { COIN_TICKER } from "@nova-org/shared";
import { ApiError, claimDailyReward } from "../apiClient.js";

export async function handleDaily(ctx: CommandContext<Context>): Promise<void> {
  const telegramUser = ctx.from;
  if (!telegramUser) return;

  try {
    const result = await claimDailyReward(telegramUser.id);

    if (result.alreadyClaimedToday) {
      await ctx.reply("You already claimed today's reward. Come back tomorrow!");
      return;
    }

    await ctx.reply(
      `✅ Daily reward claimed: +${result.amount} ${COIN_TICKER}\n` +
        `New balance: ${result.balance} ${COIN_TICKER}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await ctx.reply("Please send /start first to create your account.");
      return;
    }
    throw error;
  }
}
