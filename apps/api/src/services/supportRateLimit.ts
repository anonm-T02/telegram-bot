const SUPPORT_MUTATION_LIMIT = 30;
const SUPPORT_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetsAt: number }>();
const MAX_RATE_BUCKETS = 10_000;

export function consumeSupportMutationLimit(key: string, now = Date.now()): boolean {
  if (buckets.size >= MAX_RATE_BUCKETS && !buckets.has(key)) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (oldest) buckets.delete(oldest);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + SUPPORT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= SUPPORT_MUTATION_LIMIT) return false;
  bucket.count += 1;
  return true;
}
