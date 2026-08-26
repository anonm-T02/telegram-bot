import { prisma } from "@nova-org/db";
import { clickBodySchema } from "@nova-org/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env.js";
import {
  CLICK_DAILY_LIMIT,
  ClickRequestConflictError,
  ClickSessionError,
  getClickStatus,
  processClick,
} from "../services/click.js";
import {
  hashSessionToken,
  TelegramAuthError,
  verifySessionToken,
} from "../services/telegramAuth.js";

async function authenticate(
  request: FastifyRequest,
): Promise<{ userId: string; sessionId: string }> {
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
    select: { id: true, userId: true },
  });
  if (!session) throw new TelegramAuthError("Unknown session");
  return { userId: session.userId, sessionId: session.id };
}

export async function clickRoutes(app: FastifyInstance): Promise<void> {
  app.post("/click", async (request, reply) => {
    const body = clickBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid request body" });
    try {
      const auth = await authenticate(request);
      const result = await processClick(auth, body.data.requestId);
      if (!result.accepted) {
        request.log.warn(
          { userId: auth.userId, requestId: result.requestId, rejectionCode: result.rejectionCode },
          "Click rejected",
        );
        const statusCode = result.rejectionCode === "DAILY_LIMIT" ? 429 : 409;
        return reply.code(statusCode).send({
          error: result.rejectionCode,
          requestId: result.requestId,
          duplicate: result.duplicate,
          dailyAccepted: result.dailyAccepted,
          dailyLimit: CLICK_DAILY_LIMIT,
          nextAllowedAt: result.nextAllowedAt,
          balanceMicrocoins: result.balanceMicrocoins,
        });
      }
      request.log.info(
        { userId: auth.userId, requestId: result.requestId, duplicate: result.duplicate },
        result.duplicate ? "Duplicate click replayed" : "Click accepted and ledgered",
      );
      return reply.code(200).send({
        ...result,
        dailyLimit: CLICK_DAILY_LIMIT,
      });
    } catch (error) {
      if (error instanceof TelegramAuthError)
        return reply.code(401).send({ error: "Unauthorized" });
      if (error instanceof ClickSessionError) return reply.code(403).send({ error: error.code });
      if (error instanceof ClickRequestConflictError)
        return reply.code(409).send({ error: "REQUEST_ID_CONFLICT" });
      throw error;
    }
  });

  app.get("/click/status", async (request, reply) => {
    try {
      const auth = await authenticate(request);
      const status = await getClickStatus(auth);
      return reply.send({ ...status, dailyLimit: CLICK_DAILY_LIMIT });
    } catch (error) {
      if (error instanceof TelegramAuthError)
        return reply.code(401).send({ error: "Unauthorized" });
      throw error;
    }
  });
}
