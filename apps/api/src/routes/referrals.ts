import { prisma } from "@nova-org/db";
import { referralListQuerySchema } from "@nova-org/validation";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { getReferralDashboard } from "../services/referrals.js";
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

async function withAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  select: "all" | "link" | "stats",
) {
  try {
    const userId = await authenticate(request);
    const query = referralListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "Invalid query" });
    const dashboard = await getReferralDashboard(
      userId,
      env.TELEGRAM_BOT_USERNAME,
      query.data.limit,
    );
    request.log.info({ userId }, "Referral milestones evaluated from server activity");
    if (select === "link") {
      return reply.send({
        referralCode: dashboard.referralCode,
        referralLink: dashboard.referralLink,
      });
    }
    if (select === "stats") return reply.send(dashboard.stats);
    return reply.send(dashboard);
  } catch (error) {
    if (error instanceof TelegramAuthError) return reply.code(401).send({ error: "Unauthorized" });
    throw error;
  }
}

export async function referralRoutes(app: FastifyInstance): Promise<void> {
  app.get("/referrals", (request, reply) => withAuth(request, reply, "all"));
  app.get("/referrals/link", (request, reply) => withAuth(request, reply, "link"));
  app.get("/referrals/stats", (request, reply) => withAuth(request, reply, "stats"));
}
