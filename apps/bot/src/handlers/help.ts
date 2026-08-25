import type { CommandContext, Context } from "grammy";

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(
    "NOVA ORG commands:\n\n" +
      "/start - open the bot and launch the Mini App\n" +
      "/help - show this message\n\n" +
      "More commands (/balance, /referral) will be available once wallet " +
      "and referral features ship in Phase 2.",
  );
}
