import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SESSION_MS,
  SESSION_COOLDOWN_MS,
  assertCanStartSession,
  boundedWorkerCount,
  createWorkerMetrics,
  observe,
  stopReason,
} from "./index.js";
const consent = { consent_id: "consent-1", granted_at: 1_000 };
const limits = { max_cpu_percent: 50, max_memory_mb: 256, max_temperature_c: 70 };
const safe = { cpu_percent: 20, memory_mb: 64, temperature_c: 40 };
test("requires explicit live consent and a two-minute cooldown", () => {
  assert.throws(() => assertCanStartSession(undefined, 2_000), /consent/);
  assert.throws(() => assertCanStartSession({ ...consent, revoked_at: 1_500 }, 2_000), /consent/);
  assert.throws(
    () => assertCanStartSession(consent, 2_000, 2_000 - SESSION_COOLDOWN_MS + 1),
    /cooldown/,
  );
  assert.doesNotThrow(() => assertCanStartSession(consent, 2_000, 2_000 - SESSION_COOLDOWN_MS));
});
test("stops immediately for revoke/hidden and enforces duration and resource limits", () => {
  assert.equal(
    stopReason(1_000, 2_000, true, { ...consent, revoked_at: 1_500 }, safe, limits),
    "consent_revoked",
  );
  assert.equal(stopReason(1_000, 2_000, false, consent, safe, limits), "hidden");
  assert.equal(
    stopReason(1_000, 1_000 + MAX_SESSION_MS, true, consent, safe, limits),
    "session_expired",
  );
  assert.equal(
    stopReason(1_000, 2_000, true, consent, { ...safe, temperature_c: 70 }, limits),
    "thermal",
  );
  assert.equal(
    stopReason(1_000, 2_000, true, consent, { ...safe, cpu_percent: 51 }, limits),
    "resource_limit",
  );
});
test("caps worker concurrency and records non-sensitive metrics", () => {
  assert.equal(boundedWorkerCount(8, 8), 2);
  assert.equal(boundedWorkerCount(2, 2), 1);
  const metrics = createWorkerMetrics();
  observe(metrics, { event: "session_started", session_id: "s", at: 1 });
  observe(metrics, {
    event: "task_completed",
    session_id: "s",
    task_id: "t",
    duration_ms: 4,
    at: 5,
  });
  observe(metrics, { event: "session_stopped", session_id: "s", reason: "user_stop", at: 6 });
  assert.deepEqual(metrics, {
    sessions_started: 1,
    tasks_completed: 1,
    task_duration_ms_total: 4,
    stops_by_reason: { user_stop: 1 },
  });
});
