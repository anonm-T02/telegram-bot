import type { FastifyInstance } from "fastify";
import type { HealthCheckResponse } from "@nova-org/shared";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthCheckResponse> => {
    return {
      status: "ok",
      service: "nova-org-api",
      timestamp: new Date().toISOString(),
    };
  });
}
