import type { FastifyInstance } from "fastify";
import type { HealthCheckResponse } from "@nova-org/shared";
import { prisma } from "@nova-org/db";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "ok",
      service: "nova-org-api",
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({
        status: "ready",
        service: "nova-org-api",
        timestamp: new Date().toISOString(),
        dependencies: { postgres: "ok" },
      });
    } catch {
      return reply.code(503).send({
        status: "not_ready",
        service: "nova-org-api",
        timestamp: new Date().toISOString(),
        dependencies: { postgres: "unavailable" },
      });
    }
  });
}
