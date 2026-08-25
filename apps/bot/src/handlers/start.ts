import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { APP_NAME } from "@nova-org/shared";
import { env } from "../env.js";
import { parseReferralCode } from "../referral.js";

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const referralCode = parseReferralCode(ctx.match?.toString());

  if (referralCode) {
    // TODO(Phase 2 / AGENT 3): persist referral against the new user once
    // the users/referrals tables exist.
    console.log(`Referral code received: ${referralCode}`);
  }

  const keyboard = new InlineKeyboard().webApp("OPEN NOVA APP", env.APP_URL);

  await ctx.reply(
    `Welcome to ${APP_NAME}!\n\n` +
      "Open the Mini App to view your NOVA Coin balance, complete tasks, " +
      "and manage device contribution.",
    { reply_markup: keyboard },
  );
}
