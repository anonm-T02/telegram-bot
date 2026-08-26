import { createServer, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Bot } from "grammy";
import { env } from "./env.js";
import { handleStart } from "./handlers/start.js";
import { handleHelp } from "./handlers/help.js";
import { handleBalance } from "./handlers/balance.js";
import { handleDaily } from "./handlers/daily.js";
import { handleReferral } from "./handlers/referral.js";

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
type TelegramUpdate = Parameters<typeof bot.handleUpdate>[0];

bot.command("start", handleStart);
bot.command("help", handleHelp);
bot.command("balance", handleBalance);
bot.command("daily", handleDaily);
bot.command("referral", handleReferral);

bot.catch((error) => {
  console.error("Bot error:", error);
});

function secretMatches(value: string | string[] | undefined): boolean {
  if (typeof value !== "string" || !env.TELEGRAM_WEBHOOK_SECRET) return false;
  const actual = Buffer.from(value);
  const expected = Buffer.from(env.TELEGRAM_WEBHOOK_SECRET);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readUpdate(request: NodeJS.ReadableStream): Promise<TelegramUpdate> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buffer.length;
    if (bytes > 1024 * 1024) throw new Error("WEBHOOK_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as TelegramUpdate;
}

async function startWebhook(): Promise<Server> {
  if (!env.TELEGRAM_WEBHOOK_URL || !env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("Production bot requires TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET");
  }
  const baseUrl = env.TELEGRAM_WEBHOOK_URL.replace(/\/$/, "");
  await bot.api.setWebhook(`${baseUrl}/telegram/webhook`, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: "ok", service: "nova-org-bot" }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/telegram/webhook") {
      response.writeHead(404).end();
      return;
    }
    if (!secretMatches(request.headers["x-telegram-bot-api-secret-token"])) {
      response.writeHead(401).end();
      return;
    }
    void readUpdate(request)
      .then((update) => bot.handleUpdate(update))
      .then(() => response.writeHead(200).end())
      .catch((error: unknown) => {
        console.error("Webhook update failed:", error);
        if (!response.headersSent) response.writeHead(400);
        response.end();
      });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.PORT ?? 8080, "0.0.0.0", resolve);
  });
  console.log(`NOVA ORG webhook bot listening on 0.0.0.0:${env.PORT ?? 8080}.`);
  return server;
}

let server: Server | undefined;
async function shutdown() {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  else await bot.stop();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

if (env.NODE_ENV === "production") {
  startWebhook()
    .then((value) => {
      server = value;
    })
    .catch((error) => {
      console.error("Failed to start webhook bot:", error);
      process.exit(1);
    });
} else {
  bot
    .start({ onStart: () => console.log(`NOVA ORG bot (@${env.TELEGRAM_BOT_USERNAME}) started.`) })
    .catch((error) => {
      console.error("Failed to start bot:", error);
      process.exit(1);
    });
}
