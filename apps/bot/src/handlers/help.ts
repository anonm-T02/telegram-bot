import type { CommandContext, Context } from "grammy";

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply(
    "NOVA ORG commands:\n\n" +
      "/start - open the bot and launch the Mini App\n" +
      "/balance - check your NOVA Coin balance\n" +
      "/daily - claim your daily reward\n" +
      "/referral - get your invite link and stats\n" +
      "/help - show this message",
  );
}
