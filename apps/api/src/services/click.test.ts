import assert from "node:assert/strict";
import test from "node:test";
import {
  CLICK_DAILY_LIMIT,
  CLICK_REWARD_MICROCOINS,
  activityRejection,
  clickRiskRejection,
  decideClick,
  utcDate,
} from "./click.js";

test("utcDate normalizes a timestamp to the UTC day", () => {
  assert.deepEqual(
    utcDate(new Date("2026-08-26T23:59:59.999Z")),
    new Date("2026-08-26T00:00:00.000Z"),
  );
});

test("review and reward-hold risk levels reject clicks while normal/watch continue", () => {
  assert.equal(clickRiskRejection("NORMAL"), null);
  assert.equal(clickRiskRejection("WATCH"), null);
  assert.equal(clickRiskRejection("REVIEW_REQUIRED"), "RISK_REJECTED");
  assert.equal(clickRiskRejection("TEMPORARY_REWARD_HOLD"), "RISK_REJECTED");
});

test("a valid click awards exactly one integer microcoin", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");
  assert.equal(CLICK_REWARD_MICROCOINS, 1n);
  assert.deepEqual(decideClick(0, null, now), {
    accepted: true,
    nextAllowedAt: new Date("2026-08-26T10:00:02.000Z"),
  });
});

test("clicks inside the two-second server cooldown are rejected", () => {
  const last = new Date("2026-08-26T10:00:00.000Z");
  assert.deepEqual(decideClick(1, last, new Date("2026-08-26T10:00:01.999Z")), {
    accepted: false,
    rejectionCode: "COOLDOWN",
    nextAllowedAt: new Date("2026-08-26T10:00:02.000Z"),
  });
  assert.equal(decideClick(1, last, new Date("2026-08-26T10:00:02.000Z")).accepted, true);
});

test("the 1001st accepted click of a UTC day is rejected", () => {
  const result = decideClick(CLICK_DAILY_LIMIT, null, new Date("2026-08-26T12:00:00.000Z"));
  assert.deepEqual(result, {
    accepted: false,
    rejectionCode: "DAILY_LIMIT",
    nextAllowedAt: null,
  });
});

test("click eligibility requires the authenticated session to be fresh, active and visible", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  const eligible = {
    state: "ACTIVE",
    status: "OPEN",
    isRewardable: true,
    lastHeartbeatAt: new Date("2026-08-26T11:59:30.000Z"),
    latestHeartbeat: { isVisible: true },
  };
  assert.equal(activityRejection(eligible, now), null);
  assert.equal(
    activityRejection({ ...eligible, isRewardable: false }, now),
    "SESSION_NOT_REWARDABLE",
  );
  assert.equal(
    activityRejection({ ...eligible, lastHeartbeatAt: new Date("2026-08-26T11:58:59.999Z") }, now),
    "SESSION_INACTIVE",
  );
  assert.equal(
    activityRejection({ ...eligible, latestHeartbeat: { isVisible: false } }, now),
    "SESSION_INACTIVE",
  );
});
