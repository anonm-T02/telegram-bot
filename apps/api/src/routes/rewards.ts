import { prisma } from "@nova-org/db";
import {
  rewardIdParamsSchema,
  rewardListQuerySchema,
  rewardRequestSchema,
} from "@nova-org/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env.js";
import {
  createRewardRequest,
  getRewardRequest,
  listRewardRequests,
  RewardRequestError,
} from "../services/rewardRequests.js";
import {
  hashSessionToken,
  TelegramAuthError,
  verifySessionToken,
} from "../services/telegramAuth.js";

async function authenticate(request: FastifyRequest): Promise<string> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new TelegramAuthError("Missing token");
  const token = authorization.slice(7);
  const claims = verifySessionToken(token, env.SESSION_SECRET);
  const session = await prisma.telegramSession.findFirst({
    where: {
      userId: claims.sub,
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });
  if (!session) throw new TelegramAuthError("Unknown session");
  return session.userId;
}

function knownError(error: unknown) {
  if (error instanceof TelegramAuthError) return { status: 401, body: { error: "Unauthorized" } };
  if (error instanceof RewardRequestError) {
    const status =
      error.code === "NOT_FOUND" ? 404 : error.code === "INSUFFICIENT_BALANCE" ? 422 : 409;
    return { status, body: { error: error.code } };
  }
  return null;
}

export async function rewardRoutes(app: FastifyInstance): Promise<void> {
  app.post("/rewards/request", async (request, reply) => {
    const body = rewardRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request body" });
    try {
      const userId = await authenticate(request);
      const result = await createRewardRequest(userId, body.data.idempotencyKey);
      request.log.info(
        { userId, rewardRequestId: result.request.id, duplicate: result.duplicate },
        "Reward request recorded and balance locked",
      );
      return reply.code(result.duplicate ? 200 : 201).send(result);
    } catch (error) {
      const handled = knownError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.get("/rewards", async (request, reply) => {
    const query = rewardListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "Invalid query" });
    try {
      const userId = await authenticate(request);
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId },
        select: { balance: true, lockedBalance: true },
      });
      return reply.send({
        wallet: {
          availableMicrocoins: wallet.balance.toString(),
          lockedMicrocoins: wallet.lockedBalance.toString(),
        },
        rewards: await listRewardRequests(userId, query.data.limit, query.data.cursor),
      });
    } catch (error) {
      const handled = knownError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.get("/rewards/:id", async (request, reply) => {
    const params = rewardIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid reward id" });
    try {
      const userId = await authenticate(request);
      return reply.send(await getRewardRequest(userId, params.data.id));
    } catch (error) {
      const handled = knownError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });
}
