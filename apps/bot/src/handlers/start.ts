import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { APP_NAME, COIN_TICKER } from "@nova-org/shared";
import { env } from "../env.js";
import { parseReferralCode } from "../referral.js";
import { ApiError, approveAdminLogin, ensureUser } from "../apiClient.js";

function adminChallenge(startPayload: string | undefined): string | null {
  if (!startPayload?.startsWith("admin_")) return null;
  const id = startPayload.slice(6);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const telegramUser = ctx.from;
  if (!telegramUser) return;

  const startPayload = ctx.match?.toString();
  const referralCodeUsed = parseReferralCode(startPayload);

  await ensureUser({
    telegramId: telegramUser.id,
    username: telegramUser.username,
    firstName: telegramUser.first_name,
    lastName: telegramUser.last_name,
    languageCode: telegramUser.language_code,
    referralCodeUsed,
  });

  const challengeId = adminChallenge(startPayload);
  if (challengeId) {
    try {
      await approveAdminLogin(challengeId, telegramUser.id);
      await ctx.reply(
        "Admin login tasdiqlandi. Brauzerga qayting — sessiya avtomatik ochiladi. Bu havolani qayta ishlatib bo‘lmaydi.",
      );
    } catch (error) {
      if (error instanceof ApiError && [403, 404, 409, 410].includes(error.status)) {
        await ctx.reply(
          "Admin login tasdiqlanmadi. Havola eskirgan yoki hisobga ruxsat berilmagan.",
        );
        return;
      }
      throw error;
    }
    return;
  }

  const keyboard = new InlineKeyboard().webApp("OPEN NOVA APP", env.APP_URL);

  await ctx.reply(
    `Welcome to ${APP_NAME}!\n\n` +
      `Tap inside the Mini App to earn server-confirmed microcoins. Each valid tap has a cooldown and daily limit.\n\n` +
      `Your ${COIN_TICKER} wallet stays securely in this bot:\n` +
      "/balance - check your balance\n" +
      "/daily - claim your daily reward\n" +
      "/referral - get your invite link and stats\n\n" +
      "Rewards are checked by the server. Device contribution is separate and never starts without your explicit consent.\n\n" +
      "Open the Mini App to begin.",
    { reply_markup: keyboard },
  );
}
