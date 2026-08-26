import type { FastifyInstance } from "fastify";
import { ensureUserBodySchema, telegramIdParamSchema } from "@nova-org/validation";
import { requireInternalSecret } from "../plugins/internalAuth.js";
import { ensureUser } from "../services/users.js";
import { getWalletByTelegramId, UserNotFoundError } from "../services/wallet.js";
import { claimDailyReward } from "../services/rewards.js";
import { getReferralStats } from "../services/referral.js";

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireInternalSecret);

  app.post("/internal/users/ensure", async (request, reply) => {
    const parsed = ensureUserBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", issues: parsed.error.issues });
    }

    const result = await ensureUser({
      telegramId: BigInt(parsed.data.telegramId),
      username: parsed.data.username,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      languageCode: parsed.data.languageCode,
      referralCodeUsed: parsed.data.referralCodeUsed,
    });

    app.log.info(
      { telegramId: parsed.data.telegramId, isNewUser: result.isNewUser },
      "internal.users.ensure",
    );

    return result;
  });

  app.get("/internal/wallet/:telegramId", async (request, reply) => {
    const parsed = telegramIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", issues: parsed.error.issues });
    }

    try {
      return await getWalletByTelegramId(BigInt(parsed.data.telegramId));
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return reply.code(404).send({ error: "User not found" });
      }
      throw error;
    }
  });

  app.post("/internal/rewards/daily", async (request, reply) => {
    const parsed = telegramIdParamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", issues: parsed.error.issues });
    }

    try {
      const result = await claimDailyReward(BigInt(parsed.data.telegramId));
      app.log.info(
        { telegramId: parsed.data.telegramId, claimed: result.claimed },
        "internal.rewards.daily",
      );
      return result;
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return reply.code(404).send({ error: "User not found" });
      }
      throw error;
    }
  });

  app.get("/internal/referral/:telegramId", async (request, reply) => {
    const parsed = telegramIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request", issues: parsed.error.issues });
    }

    try {
      return await getReferralStats(BigInt(parsed.data.telegramId));
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return reply.code(404).send({ error: "User not found" });
      }
      throw error;
    }
  });
}
