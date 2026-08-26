import assert from "node:assert/strict";
import test from "node:test";
import { calculateRisk, isRewardRiskSafe } from "./risk.js";

test("shared IP alone never causes review or an automatic reward hold", () => {
  assert.deepEqual(calculateRisk([{ type: "SHARED_IP", weight: 100 }]), {
    score: 100,
    level: "WATCH",
  });
});

test("risk thresholds use multiple server signals", () => {
  assert.equal(calculateRisk([{ type: "CLICK_PATTERN", weight: 19 }]).level, "NORMAL");
  assert.equal(calculateRisk([{ type: "CLICK_PATTERN", weight: 20 }]).level, "WATCH");
  assert.equal(calculateRisk([{ type: "CLICK_PATTERN", weight: 50 }]).level, "REVIEW_REQUIRED");
  assert.equal(
    calculateRisk([{ type: "IMPOSSIBLE_ACTIVITY", weight: 80 }]).level,
    "TEMPORARY_REWARD_HOLD",
  );
});

test("only normal and watch levels are reward-safe", () => {
  assert.equal(isRewardRiskSafe("NORMAL"), true);
  assert.equal(isRewardRiskSafe("WATCH"), true);
  assert.equal(isRewardRiskSafe("REVIEW_REQUIRED"), false);
  assert.equal(isRewardRiskSafe("TEMPORARY_REWARD_HOLD"), false);
});
