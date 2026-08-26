export function allowedBrowserOrigins(appUrl: string, adminUrl: string): string[] {
  return [...new Set([new URL(appUrl).origin, new URL(adminUrl).origin])];
}

const AUTH_LIMIT = 30;
const AUTH_WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;
const authBuckets = new Map<string, { count: number; resetsAt: number }>();

export function consumeAuthRateLimit(key: string, now = Date.now()): boolean {
  if (authBuckets.size >= MAX_BUCKETS && !authBuckets.has(key)) {
    const oldest = authBuckets.keys().next().value as string | undefined;
    if (oldest) authBuckets.delete(oldest);
  }
  const bucket = authBuckets.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    authBuckets.set(key, { count: 1, resetsAt: now + AUTH_WINDOW_MS });
    return true;
  }
  if (bucket.count >= AUTH_LIMIT) return false;
  bucket.count += 1;
  return true;
}

export function internalSecretMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const suppliedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}
import { timingSafeEqual } from "node:crypto";
