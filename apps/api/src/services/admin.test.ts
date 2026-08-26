import assert from "node:assert/strict";
import test from "node:test";
import {
  adminReplayMatches,
  canAdminMutate,
  isConfiguredAdmin,
  settingValueIsValid,
} from "./adminPolicy.js";

test("admin allowlist compares exact Telegram identities", () => {
  assert.equal(isConfiguredAdmin(42n, ["42", "420"]), true);
  assert.equal(isConfiguredAdmin(4n, ["42", "420"]), false);
});

test("reviewers are read-only and settings require super admin", () => {
  assert.equal(canAdminMutate("REVIEWER", "USER_STATUS"), false);
  assert.equal(canAdminMutate("OPERATOR", "USER_STATUS"), true);
  assert.equal(canAdminMutate("OPERATOR", "SETTING"), false);
  assert.equal(canAdminMutate("SUPER_ADMIN", "SETTING"), true);
});

test("system settings are allowlisted and bounded", () => {
  assert.equal(settingValueIsValid("reward.payoutPaused", true), true);
  assert.equal(settingValueIsValid("reward.payoutPaused", 1), false);
  assert.equal(settingValueIsValid("reward.dailyLimitUnits", 50), true);
  assert.equal(settingValueIsValid("reward.dailyLimitUnits", 0), false);
  assert.equal(settingValueIsValid("UNKNOWN", 1), false);
});

test("admin idempotency replay binds actor and exact requested payload", () => {
  const existing = {
    adminId: "admin-1",
    action: "USER_STATUS_CHANGED",
    entityId: "user-1",
    after: { status: "BLOCKED" },
    metadata: { reason: "confirmed abuse" },
  };
  const expected = {
    adminId: "admin-1",
    action: "USER_STATUS_CHANGED",
    entityId: "user-1",
    payloadKey: "status" as const,
    payloadValue: "BLOCKED",
    reason: "confirmed abuse",
  };
  assert.equal(adminReplayMatches(existing, expected), true);
  assert.equal(adminReplayMatches(existing, { ...expected, adminId: "admin-2" }), false);
  assert.equal(adminReplayMatches(existing, { ...expected, payloadValue: "ACTIVE" }), false);
  assert.equal(adminReplayMatches(existing, { ...expected, reason: "different" }), false);
});
