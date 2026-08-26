import type { SignedBenchmarkTask } from "./taskContract.js";
import { verifyBenchmarkTask } from "./taskContract.js";
export interface BenchmarkResult {
  task_id: string;
  result: number;
  duration_ms: number;
}
export function executeAllowlistedBenchmark(task: SignedBenchmarkTask): number {
  let value = task.input.seed >>> 0;
  for (let index = 0; index < task.input.iterations; index += 1) {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
    value = (value ^ (value >>> 16) ^ index) >>> 0;
  }
  return value;
}
export function validateBenchmarkResult(
  taskValue: unknown,
  resultValue: unknown,
  secret: string,
  now = Date.now(),
): BenchmarkResult {
  const task = verifyBenchmarkTask(taskValue, secret, now);
  if (!resultValue || typeof resultValue !== "object" || Array.isArray(resultValue))
    throw new Error("Invalid result contract");
  const result = resultValue as Record<string, unknown>;
  if (
    Object.keys(result).sort().join("\0") !== ["duration_ms", "result", "task_id"].sort().join("\0")
  )
    throw new Error("Result contains unknown or missing fields");
  if (
    result.task_id !== task.task_id ||
    !Number.isSafeInteger(result.result) ||
    !Number.isSafeInteger(result.duration_ms) ||
    (result.duration_ms as number) < 0
  )
    throw new Error("Invalid benchmark result");
  if (result.result !== executeAllowlistedBenchmark(task))
    throw new Error("Benchmark result mismatch");
  return result as unknown as BenchmarkResult;
}
