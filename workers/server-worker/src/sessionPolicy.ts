export const MAX_SESSION_MS = 10 * 60_000;
export const SESSION_COOLDOWN_MS = 2 * 60_000;
export type StopReason =
  "user_stop" | "consent_revoked" | "hidden" | "thermal" | "resource_limit" | "session_expired";
export interface ResourceSnapshot {
  cpu_percent: number;
  memory_mb: number;
  temperature_c?: number;
}
export interface ResourceLimits {
  max_cpu_percent: number;
  max_memory_mb: number;
  max_temperature_c: number;
}
export interface Consent {
  consent_id: string;
  granted_at: number;
  revoked_at?: number;
}

export function assertCanStartSession(
  consent: Consent | undefined,
  now: number,
  previousEndedAt?: number,
): void {
  if (!consent || consent.revoked_at !== undefined || consent.granted_at > now)
    throw new Error("Explicit active consent is required");
  if (previousEndedAt !== undefined && now - previousEndedAt < SESSION_COOLDOWN_MS)
    throw new Error("Session cooldown is active");
}
export function stopReason(
  startedAt: number,
  now: number,
  visible: boolean,
  consent: Consent,
  resources: ResourceSnapshot,
  limits: ResourceLimits,
): StopReason | undefined {
  if (consent.revoked_at !== undefined) return "consent_revoked";
  if (!visible) return "hidden";
  if (now - startedAt >= MAX_SESSION_MS) return "session_expired";
  if (resources.temperature_c !== undefined && resources.temperature_c >= limits.max_temperature_c)
    return "thermal";
  if (resources.cpu_percent > limits.max_cpu_percent || resources.memory_mb > limits.max_memory_mb)
    return "resource_limit";
  return undefined;
}
export function boundedWorkerCount(requested: number, hardwareConcurrency: number): number {
  if (
    !Number.isSafeInteger(requested) ||
    !Number.isSafeInteger(hardwareConcurrency) ||
    requested < 1 ||
    hardwareConcurrency < 1
  )
    return 1;
  return Math.max(1, Math.min(requested, 2, Math.max(1, hardwareConcurrency - 1)));
}
