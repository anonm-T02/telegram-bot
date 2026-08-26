import { Bot } from "grammy";
import { env } from "./env.js";
import { handleStart } from "./handlers/start.js";
import { handleHelp } from "./handlers/help.js";
import { handleBalance } from "./handlers/balance.js";
import { handleDaily } from "./handlers/daily.js";
import { handleReferral } from "./handlers/referral.js";

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.command("start", handleStart);
bot.command("help", handleHelp);
bot.command("balance", handleBalance);
bot.command("daily", handleDaily);
bot.command("referral", handleReferral);

bot.catch((error) => {
  console.error("Bot error:", error);
});

bot
  .start({
    onStart: () => {
      console.log(`NOVA ORG bot (@${env.TELEGRAM_BOT_USERNAME}) started.`);
    },
  })
  .catch((error) => {
    console.error("Failed to start bot:", error);
    process.exit(1);
  });
