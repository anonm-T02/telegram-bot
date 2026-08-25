import { Bot } from "grammy";
import { env } from "./env.js";
import { handleStart } from "./handlers/start.js";
import { handleHelp } from "./handlers/help.js";

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.command("start", handleStart);
bot.command("help", handleHelp);

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
