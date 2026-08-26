import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.js";
import { internalRoutes } from "./routes/internal.js";
import { authRoutes } from "./routes/auth.js";
import { activityRoutes } from "./routes/activity.js";
import { meRoutes } from "./routes/me.js";
import { clickRoutes } from "./routes/click.js";
import { referralRoutes } from "./routes/referrals.js";
import { rewardRoutes } from "./routes/rewards.js";
import { expireStaleActivitySessions } from "./services/activity.js";

const ACTIVITY_SWEEP_INTERVAL_MS = 20_000;

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.register(healthRoutes);
  app.register(internalRoutes);
  app.register(authRoutes);
  app.register(activityRoutes);
  app.register(meRoutes);
  app.register(clickRoutes);
  app.register(referralRoutes);
  app.register(rewardRoutes);

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
