/**
 * Minimal shared type placeholders for Phase 1 (Foundation).
 * Full domain types (User, Wallet, ContributionSession, WorkUnit, etc.)
 * will be introduced in Phase 2/3 alongside the database schema.
 */
export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}
