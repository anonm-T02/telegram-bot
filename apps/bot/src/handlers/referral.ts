import type { CommandContext, Context } from "grammy";
import { COIN_TICKER, REFERRAL_DEEP_LINK_PREFIX } from "@nova-org/shared";
import { ApiError, getReferralStats } from "../apiClient.js";
import { env } from "../env.js";

export async function handleReferral(ctx: CommandContext<Context>): Promise<void> {
  const telegramUser = ctx.from;
  if (!telegramUser) return;

  try {
    const stats = await getReferralStats(telegramUser.id);
    const link = `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${REFERRAL_DEEP_LINK_PREFIX}${stats.referralCode}`;

    await ctx.reply(
      "Your referral link:\n" +
        `${link}\n\n` +
        `Invited friends: ${stats.invitedCount}\n` +
        `Earned via referrals: ${stats.totalEarned} ${COIN_TICKER}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      await ctx.reply("Please send /start first to create your account.");
      return;
    }
    throw error;
  }
}
