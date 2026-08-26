import { prisma } from "@nova-org/db";
import {
  adminFraudListQuerySchema,
  adminLoginChallengeBodySchema,
  adminLoginExchangeBodySchema,
  adminListQuerySchema,
  adminRewardListQuerySchema,
  adminSettingBodySchema,
  adminSettingParamsSchema,
  adminUserListQuerySchema,
  adminUserParamsSchema,
  adminUserStatusBodySchema,
} from "@nova-org/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdminAccessError,
  authenticateAdmin,
  changeSystemSetting,
  changeUserStatus,
  getAdminDashboard,
  hashAdminIp,
  listAdminUsers,
  type AdminIdentity,
} from "../services/admin.js";
import {
  AdminLoginError,
  createAdminLoginChallenge,
  exchangeAdminLoginChallenge,
} from "../services/adminLogin.js";
import { consumeAdminRateLimit } from "../services/adminRateLimit.js";

async function admin(request: FastifyRequest): Promise<AdminIdentity> {
  return authenticateAdmin(request.headers.authorization);
}

function handle(error: unknown, reply: FastifyReply) {
  if (!(error instanceof AdminAccessError)) throw error;
  const status =
    error.code === "UNAUTHORIZED"
      ? 401
      : error.code === "FORBIDDEN"
        ? 403
        : error.code === "NOT_FOUND"
          ? 404
          : 409;
  return reply.code(status).send({ error: error.code });
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (!consumeAdminRateLimit(request.ip)) {
      await reply.code(429).send({ error: "RATE_LIMITED" });
    }
  });

  app.post("/auth/challenge", async (request, reply) => {
    const body = adminLoginChallengeBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    return reply.code(201).send(await createAdminLoginChallenge(body.data.codeChallenge));
  });

  app.post("/auth/exchange", async (request, reply) => {
    const body = adminLoginExchangeBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      return reply.send(
        await exchangeAdminLoginChallenge({
          ...body.data,
          ipHash: hashAdminIp(request.ip),
          userAgent: request.headers["user-agent"],
        }),
      );
    } catch (error) {
      if (!(error instanceof AdminLoginError)) throw error;
      const status =
        error.code === "PENDING"
          ? 202
          : error.code === "EXPIRED" || error.code === "CONSUMED"
            ? 410
            : error.code === "NOT_FOUND"
              ? 404
              : error.code === "FORBIDDEN"
                ? 403
                : 409;
      return reply.code(status).send({ error: error.code });
    }
  });

  app.get("/dashboard", async (request, reply) => {
    try {
      await admin(request);
      return reply.send(await getAdminDashboard());
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.get("/users", async (request, reply) => {
    const query = adminUserListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    try {
      await admin(request);
      return reply.send({ users: await listAdminUsers(query.data) });
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.patch("/users/:id/status", async (request, reply) => {
    const params = adminUserParamsSchema.safeParse(request.params);
    const body = adminUserStatusBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const identity = await admin(request);
      const result = await changeUserStatus({
        admin: identity,
        targetUserId: params.data.id,
        ...body.data,
        ipHash: hashAdminIp(request.ip),
      });
      request.log.warn(
        { adminId: identity.id, targetUserId: params.data.id, auditId: result.auditId },
        "Administrative user status mutation",
      );
      return reply.send(result);
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.get("/rewards", async (request, reply) => {
    const query = adminRewardListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    try {
      await admin(request);
      const rewards = await prisma.rewardRequest.findMany({
        take: query.data.limit,
        ...(query.data.cursor ? { skip: 1, cursor: { id: query.data.cursor } } : {}),
        where: query.data.status ? { status: query.data.status } : {},
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          status: true,
          coinAmount: true,
          rewardUnits: true,
          providerType: true,
          requestedAt: true,
          completedAt: true,
        },
      });
      return reply.send({
        rewards: rewards.map((item) => ({ ...item, coinAmount: item.coinAmount.toString() })),
      });
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.get("/fraud", async (request, reply) => {
    const query = adminFraudListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    try {
      await admin(request);
      const signals = await prisma.fraudSignal.findMany({
        take: query.data.limit,
        ...(query.data.cursor ? { skip: 1, cursor: { id: query.data.cursor } } : {}),
        where: query.data.status ? { status: query.data.status } : {},
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          weight: true,
          source: true,
          detectedAt: true,
          expiresAt: true,
        },
      });
      return reply.send({ signals });
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.get("/support", async (request, reply) => {
    const query = adminListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    try {
      await admin(request);
      const tickets = await prisma.supportTicket.findMany({
        take: query.data.limit,
        ...(query.data.cursor ? { skip: 1, cursor: { id: query.data.cursor } } : {}),
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          subject: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return reply.send({ tickets });
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.get("/audit", async (request, reply) => {
    const query = adminListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    try {
      await admin(request);
      const logs = await prisma.adminAuditLog.findMany({
        take: query.data.limit,
        ...(query.data.cursor ? { skip: 1, cursor: { id: query.data.cursor } } : {}),
        orderBy: { id: "asc" },
        select: {
          id: true,
          adminId: true,
          action: true,
          entityType: true,
          entityId: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
      });
      return reply.send({ logs });
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.get("/settings", async (request, reply) => {
    try {
      await admin(request);
      const settings = await prisma.systemSetting.findMany({
        where: { key: { in: ["reward.payoutPaused", "reward.dailyLimitUnits"] } },
        orderBy: { key: "asc" },
        select: { key: true, value: true, updatedAt: true },
      });
      return reply.send({ settings });
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.put("/settings/:key", async (request, reply) => {
    const params = adminSettingParamsSchema.safeParse(request.params);
    const body = adminSettingBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const identity = await admin(request);
      const result = await changeSystemSetting({
        admin: identity,
        key: params.data.key,
        ...body.data,
        ipHash: hashAdminIp(request.ip),
      });
      request.log.warn(
        { adminId: identity.id, setting: params.data.key, auditId: result.auditId },
        "Administrative setting mutation",
      );
      return reply.send(result);
    } catch (error) {
      return handle(error, reply);
    }
  });
}
