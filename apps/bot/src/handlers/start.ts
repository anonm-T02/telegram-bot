import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { APP_NAME, COIN_TICKER } from "@nova-org/shared";
import { env } from "../env.js";
import { parseReferralCode } from "../referral.js";
import { ensureUser } from "../apiClient.js";

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const telegramUser = ctx.from;
  if (!telegramUser) return;

  const referralCodeUsed = parseReferralCode(ctx.match?.toString());

  await ensureUser({
    telegramId: telegramUser.id,
    username: telegramUser.username,
    firstName: telegramUser.first_name,
    lastName: telegramUser.last_name,
    languageCode: telegramUser.language_code,
    referralCodeUsed,
  });

  const keyboard = new InlineKeyboard().webApp("OPEN NOVA APP", env.APP_URL);

  await ctx.reply(
    `Welcome to ${APP_NAME}!\n\n` +
      `Your ${COIN_TICKER} balance lives right here in the bot:\n` +
      "/balance - check your balance\n" +
      "/daily - claim your daily reward\n" +
      "/referral - get your invite link and stats\n\n" +
      "Open the Mini App for tasks and device contribution.",
    { reply_markup: keyboard },
  );
}
