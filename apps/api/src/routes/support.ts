import { prisma } from "@nova-org/db";
import {
  faqQuerySchema,
  supportChatBodySchema,
  supportListQuerySchema,
  supportTicketBodySchema,
  supportTicketParamsSchema,
} from "@nova-org/validation";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { listPublicFaq, supportChat } from "../services/support.js";
import { createSupportAiProvider } from "../services/supportAi.js";
import { consumeSupportMutationLimit } from "../services/supportRateLimit.js";
import {
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  SupportError,
} from "../services/supportTickets.js";
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

const supportAiProvider = createSupportAiProvider({
  accountId: env.CLOUDFLARE_AI_ACCOUNT_ID,
  apiToken: env.CLOUDFLARE_AI_API_TOKEN,
  model: env.CLOUDFLARE_AI_MODEL,
  dailyBonus: env.CLOUDFLARE_AI_DAILY_BONUS,
});

function supportError(error: unknown) {
  if (error instanceof TelegramAuthError) return { status: 401, body: { error: "UNAUTHORIZED" } };
  if (error instanceof SupportError) {
    return {
      status: error.code === "NOT_FOUND" ? 404 : 409,
      body: { error: error.code },
    };
  }
  return null;
}

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/support/faq", async (request, reply) => {
    const query = faqQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    return reply.send({ articles: await listPublicFaq(query.data.locale) });
  });

  app.post("/support/chat", async (request, reply) => {
    if (!consumeSupportMutationLimit(request.ip)) {
      return reply.code(429).send({ error: "RATE_LIMITED" });
    }
    const body = supportChatBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const userId = await authenticate(request);
      const result = await supportChat(userId, body.data, supportAiProvider);
      request.log.info(
        { userId, conversationId: result.conversationId, source: result.source },
        "Support response recorded",
      );
      return reply.send(result);
    } catch (error) {
      const known = supportError(error);
      if (known) return reply.code(known.status).send(known.body);
      throw error;
    }
  });

  app.post("/support/tickets", async (request, reply) => {
    if (!consumeSupportMutationLimit(request.ip)) {
      return reply.code(429).send({ error: "RATE_LIMITED" });
    }
    const body = supportTicketBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    try {
      const userId = await authenticate(request);
      const result = await createSupportTicket(userId, body.data);
      request.log.info(
        { userId, ticketId: result.ticket.id, duplicate: result.duplicate },
        "Support ticket recorded",
      );
      return reply.code(result.duplicate ? 200 : 201).send(result);
    } catch (error) {
      const known = supportError(error);
      if (known) return reply.code(known.status).send(known.body);
      throw error;
    }
  });

  app.get("/support/tickets", async (request, reply) => {
    const query = supportListQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "INVALID_QUERY" });
    try {
      const userId = await authenticate(request);
      return reply.send({ tickets: await listSupportTickets(userId, query.data.limit) });
    } catch (error) {
      const known = supportError(error);
      if (known) return reply.code(known.status).send(known.body);
      throw error;
    }
  });

  app.get("/support/tickets/:id", async (request, reply) => {
    const params = supportTicketParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "INVALID_TICKET_ID" });
    try {
      const userId = await authenticate(request);
      return reply.send(await getSupportTicket(userId, params.data.id));
    } catch (error) {
      const known = supportError(error);
      if (known) return reply.code(known.status).send(known.body);
      throw error;
    }
  });
}
