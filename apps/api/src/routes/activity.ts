import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@nova-org/db";
import { activityBodySchema } from "@nova-org/validation";
import { env } from "../env.js";
import {
  hashSessionToken,
  TelegramAuthError,
  verifySessionToken,
} from "../services/telegramAuth.js";
import { recordActivity } from "../services/activity.js";

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
      user: { status: "ACTIVE" },
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true },
  });
  if (!session) throw new TelegramAuthError("Unknown session");
  return { userId: session.userId, sessionId: session.id };
}

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  const handle = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = activityBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid activity payload" });
    try {
      const auth = await authenticate(request);
      await recordActivity(auth, body.data);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof TelegramAuthError)
        return reply.code(401).send({ error: "Unauthorized" });
      throw error;
    }
  };

  app.post("/activity/heartbeat", handle);
  app.post("/activity/state", handle);
}
