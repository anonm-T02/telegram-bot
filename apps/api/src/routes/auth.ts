import type { FastifyInstance } from "fastify";
import {
  logoutAuthBodySchema,
  refreshAuthBodySchema,
  telegramAuthBodySchema,
} from "@nova-org/validation";
import { env } from "../env.js";
import { authUserRepository } from "../repositories/authUsers.js";
import {
  authenticateTelegram,
  logoutSession,
  refreshSession,
  TelegramAuthError,
} from "../services/telegramAuth.js";
import { consumeAuthRateLimit } from "../services/appSecurity.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (!consumeAuthRateLimit(request.ip)) {
      await reply.code(429).send({ error: "RATE_LIMITED" });
    }
  });
  app.post("/auth/telegram", async (request, reply) => {
    const body = telegramAuthBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }

    try {
      const result = await authenticateTelegram(body.data.initData, {
        botToken: env.TELEGRAM_BOT_TOKEN,
        sessionSecret: env.SESSION_SECRET,
        users: authUserRepository,
      });
      request.log.info({ userId: result.userId }, "Telegram authentication succeeded");
      return reply.code(200).send({
        accessToken: result.token,
        refreshToken: result.refreshToken,
        tokenType: "Bearer",
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      if (error instanceof TelegramAuthError) {
        request.log.warn("Telegram authentication rejected");
        return reply.code(401).send({ error: "Invalid or expired Telegram authentication data" });
      }
      throw error;
    }
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshAuthBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request body" });
    try {
      const result = await refreshSession(body.data.refreshToken, {
        sessionSecret: env.SESSION_SECRET,
        users: authUserRepository,
      });
      request.log.info({ userId: result.userId }, "Authentication session rotated");
      return reply.code(200).send({
        accessToken: result.token,
        refreshToken: result.refreshToken,
        tokenType: "Bearer",
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      if (error instanceof TelegramAuthError)
        return reply.code(401).send({ error: "Invalid or expired refresh token" });
      throw error;
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = logoutAuthBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request body" });
    try {
      const userId = await logoutSession(body.data.refreshToken, {
        sessionSecret: env.SESSION_SECRET,
        users: authUserRepository,
      });
      request.log.info({ userId }, "Authentication session revoked");
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof TelegramAuthError)
        return reply.code(401).send({ error: "Invalid or expired refresh token" });
      throw error;
    }
  });
}
