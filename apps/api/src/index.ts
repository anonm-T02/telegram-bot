import { env } from "./env.js";
import { buildApp } from "./app.js";

const app = buildApp();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "API shutdown requested");
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  try {
    await app.close();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    app.log.error(error, "API graceful shutdown failed");
    process.exit(1);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`NOVA ORG API listening at ${address}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
