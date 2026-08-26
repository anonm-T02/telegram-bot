import assert from "node:assert/strict";
import test from "node:test";
import {
  executeAllowlistedBenchmark,
  signBenchmarkTask,
  validateBenchmarkResult,
  verifyBenchmarkTask,
} from "./index.js";
const secret = "phase-eight-test-secret-at-least-32-bytes";
const now = 2_000_000;
const unsigned = {
  task_id: "task_abcdefghijklmnop",
  task_type: "integer-mix" as const,
  version: 1 as const,
  issued_at: now - 1_000,
  expires_at: now + 60_000,
  input: { seed: 42, iterations: 100 },
};
test("accepts valid signed allowlisted tasks and detects tampering", () => {
  const task = signBenchmarkTask(unsigned, secret);
  assert.deepEqual(verifyBenchmarkTask(task, secret, now), task);
  assert.throws(
    () => verifyBenchmarkTask({ ...task, input: { ...task.input, seed: 43 } }, secret, now),
    /signature/,
  );
});
test("rejects executable fields, unsafe workload, and expiry", () => {
  const task = signBenchmarkTask(unsigned, secret);
  assert.throws(
    () => verifyBenchmarkTask({ ...task, javascript: "while(true){}" }, secret, now),
    /unknown/,
  );
  assert.throws(
    () =>
      verifyBenchmarkTask(
        signBenchmarkTask({ ...unsigned, input: { seed: 1, iterations: 250_001 } }, secret),
        secret,
        now,
      ),
    /Iterations/,
  );
  assert.throws(
    () =>
      verifyBenchmarkTask(signBenchmarkTask({ ...unsigned, expires_at: now }, secret), secret, now),
    /expired/,
  );
});
test("validates deterministic output", () => {
  const task = signBenchmarkTask(unsigned, secret);
  const result = {
    task_id: task.task_id,
    result: executeAllowlistedBenchmark(task),
    duration_ms: 5,
  };
  assert.deepEqual(validateBenchmarkResult(task, result, secret, now), result);
  assert.throws(
    () => validateBenchmarkResult(task, { ...result, result: result.result + 1 }, secret, now),
    /mismatch/,
  );
});
