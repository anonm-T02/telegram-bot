import { createHmac, timingSafeEqual } from "node:crypto";

export const TASK_TYPES = ["integer-mix"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export interface SignedBenchmarkTask {
  task_id: string;
  task_type: TaskType;
  version: 1;
  issued_at: number;
  expires_at: number;
  input: { seed: number; iterations: number };
  signature: string;
}
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const SIG_PATTERN = /^[a-f0-9]{64}$/;
const TASK_KEYS = [
  "expires_at",
  "input",
  "issued_at",
  "signature",
  "task_id",
  "task_type",
  "version",
];
const INPUT_KEYS = ["iterations", "seed"];
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

export function parseSignedBenchmarkTask(value: unknown): SignedBenchmarkTask {
  if (
    !record(value) ||
    !exact(value, TASK_KEYS) ||
    !record(value.input) ||
    !exact(value.input, INPUT_KEYS)
  )
    throw new Error("Task contract contains unknown or missing fields");
  if (typeof value.task_id !== "string" || !ID_PATTERN.test(value.task_id))
    throw new Error("Invalid task_id");
  if (value.task_type !== "integer-mix" || value.version !== 1)
    throw new Error("Task type/version is not allowlisted");
  if (
    !Number.isSafeInteger(value.issued_at) ||
    !Number.isSafeInteger(value.expires_at) ||
    (value.expires_at as number) <= (value.issued_at as number)
  )
    throw new Error("Invalid task timestamps");
  if (
    !Number.isSafeInteger(value.input.seed) ||
    (value.input.seed as number) < 0 ||
    (value.input.seed as number) > 0xffffffff
  )
    throw new Error("Invalid seed");
  if (
    !Number.isSafeInteger(value.input.iterations) ||
    (value.input.iterations as number) < 1 ||
    (value.input.iterations as number) > 250_000
  )
    throw new Error("Iterations exceed safe allowlist limit");
  if (typeof value.signature !== "string" || !SIG_PATTERN.test(value.signature))
    throw new Error("Invalid signature format");
  return value as unknown as SignedBenchmarkTask;
}
function payload(task: Omit<SignedBenchmarkTask, "signature">): string {
  return JSON.stringify([
    task.task_id,
    task.task_type,
    task.version,
    task.issued_at,
    task.expires_at,
    task.input.seed,
    task.input.iterations,
  ]);
}
export function signBenchmarkTask(
  task: Omit<SignedBenchmarkTask, "signature">,
  secret: string,
): SignedBenchmarkTask {
  if (secret.length < 32) throw new Error("Signing secret must be at least 32 characters");
  return { ...task, signature: createHmac("sha256", secret).update(payload(task)).digest("hex") };
}
export function verifyBenchmarkTask(
  value: unknown,
  secret: string,
  now = Date.now(),
): SignedBenchmarkTask {
  const task = parseSignedBenchmarkTask(value);
  const { signature, ...unsigned } = task;
  const expected = signBenchmarkTask(unsigned, secret).signature;
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex")))
    throw new Error("Invalid task signature");
  if (task.issued_at > now + 30_000) throw new Error("Task issued in the future");
  if (task.expires_at <= now) throw new Error("Task expired");
  if (task.expires_at - task.issued_at > 10 * 60_000)
    throw new Error("Task lifetime exceeds session limit");
  return task;
}
