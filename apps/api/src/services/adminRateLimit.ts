export const ADMIN_RATE_LIMIT = 120;
export const ADMIN_RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetsAt: number }>();
const MAX_RATE_BUCKETS = 10_000;

export function consumeAdminRateLimit(key: string, now = Date.now()): boolean {
  if (rateBuckets.size >= MAX_RATE_BUCKETS && !rateBuckets.has(key)) {
    const oldest = rateBuckets.keys().next().value as string | undefined;
    if (oldest) rateBuckets.delete(oldest);
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    rateBuckets.set(key, { count: 1, resetsAt: now + ADMIN_RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= ADMIN_RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}
