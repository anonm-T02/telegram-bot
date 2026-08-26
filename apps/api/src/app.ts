import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { internalRoutes } from "./routes/internal.js";
import { authRoutes } from "./routes/auth.js";
import { activityRoutes } from "./routes/activity.js";
import { meRoutes } from "./routes/me.js";
import { clickRoutes } from "./routes/click.js";
import { referralRoutes } from "./routes/referrals.js";
import { rewardRoutes } from "./routes/rewards.js";
import { adminRoutes } from "./routes/admin.js";
import { supportRoutes } from "./routes/support.js";
import { expireStaleActivitySessions } from "./services/activity.js";
import { env } from "./env.js";
import { allowedBrowserOrigins } from "./services/appSecurity.js";

const ACTIVITY_SWEEP_INTERVAL_MS = 20_000;

export function buildApp(): FastifyInstance {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          'req.headers["x-internal-secret"]',
          'res.headers["set-cookie"]',
        ],
        censor: "[REDACTED]",
      },
    },
  });

  void app.register(cors, {
    origin: allowedBrowserOrigins(env.APP_URL, env.ADMIN_URL),
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"],
    credentials: false,
  });

  app.register(healthRoutes);
  app.register(internalRoutes);
  app.register(authRoutes);
  app.register(activityRoutes);
  app.register(meRoutes);
  app.register(clickRoutes);
  app.register(referralRoutes);
  app.register(rewardRoutes);
  app.register(adminRoutes, { prefix: "/admin" });
  app.register(supportRoutes);

  let activitySweep: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    await expireStaleActivitySessions();
    activitySweep = setInterval(() => {
      void expireStaleActivitySessions().catch((error: unknown) => {
        app.log.error(error, "Failed to expire stale activity sessions");
      });
    }, ACTIVITY_SWEEP_INTERVAL_MS);
    activitySweep.unref();
  });
  app.addHook("onClose", async () => {
    if (activitySweep) clearInterval(activitySweep);
  });

  return app;
}
