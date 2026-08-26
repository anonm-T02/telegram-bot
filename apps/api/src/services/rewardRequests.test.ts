import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionReward, rewardBudgetDecision } from "./rewardRequests.js";

test("reward state transitions are strict and terminal states cannot move", () => {
  assert.equal(canTransitionReward("QUEUED", "SENDING"), true);
  assert.equal(canTransitionReward("SENDING", "PAID"), true);
  assert.equal(canTransitionReward("SENDING", "FAILED"), true);
  assert.equal(canTransitionReward("QUEUED", "REJECTED"), true);
  assert.equal(canTransitionReward("PAID", "FAILED"), false);
  assert.equal(canTransitionReward("REFUNDED", "SENDING"), false);
});

test("daily budget admits exactly five ten-Star rewards", () => {
  assert.deepEqual(rewardBudgetDecision(40, 10, false), { reserve: true, queued: false });
  assert.deepEqual(rewardBudgetDecision(50, 10, false), { reserve: false, queued: true });
  assert.deepEqual(rewardBudgetDecision(0, 10, false, 50, 50), {
    reserve: false,
    queued: true,
  });
  assert.deepEqual(rewardBudgetDecision(0, 10, true), { reserve: false, queued: true });
});
