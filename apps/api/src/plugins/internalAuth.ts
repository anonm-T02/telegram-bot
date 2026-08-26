import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { internalSecretMatches } from "../services/appSecurity.js";

const INTERNAL_SECRET_HEADER = "x-internal-secret";

/**
 * Guards the `/internal/*` routes so only the trusted Telegram bot
 * process can call them — never the Mini App/browser. Coin balances must
 * only ever change through this backend-controlled surface (see
 * NOVA_ORG_AGENT_PLAN.md sections 13, 29).
 */
export async function requireInternalSecret(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const provided = request.headers[INTERNAL_SECRET_HEADER];

  if (!internalSecretMatches(provided, env.INTERNAL_API_SECRET)) {
    await reply.code(401).send({ error: "Unauthorized" });
  }
}
