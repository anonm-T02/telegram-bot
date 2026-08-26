import { prisma } from "@nova-org/db";
import { accountDeletionRequestBodySchema } from "@nova-org/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { accountDeletionRepository, requestAccountDeletion } from "../services/accountDeletion.js";
import {
  hashSessionToken,
  TelegramAuthError,
  verifySessionToken,
} from "../services/telegramAuth.js";

async function authenticate(request: FastifyRequest) {
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
    select: {
      id: true,
      authenticatedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          lastName: true,
          languageCode: true,
          createdAt: true,
        },
      },
    },
  });
  if (!session) throw new TelegramAuthError("Unknown session");
  return session;
}

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", async (request, reply) => {
    try {
      const session = await authenticate(request);
      return reply.send({
        user: { ...session.user, telegramId: session.user.telegramId.toString() },
        session: {
          id: session.id,
          authenticatedAt: session.authenticatedAt,
          expiresAt: session.expiresAt,
        },
      });
    } catch (error) {
      if (error instanceof TelegramAuthError)
        return reply.code(401).send({ error: "Unauthorized" });
      throw error;
    }
  });

  app.post("/me/deletion-request", async (request, reply) => {
    const body = accountDeletionRequestBodySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "Invalid request body" });
    try {
      const session = await authenticate(request);
      const result = await requestAccountDeletion(accountDeletionRepository, {
        userId: session.user.id,
        reason: body.data.reason,
      });
      request.log.info(
        { userId: session.user.id, deletionRequestId: result.record.id, created: result.created },
        "Account deletion requested",
      );
      return reply.code(result.created ? 202 : 200).send({
        requestId: result.record.id,
        status: result.record.status,
        requestedAt: result.record.requestedAt,
      });
    } catch (error) {
      if (error instanceof TelegramAuthError)
        return reply.code(401).send({ error: "Unauthorized" });
      throw error;
    }
  });
}
