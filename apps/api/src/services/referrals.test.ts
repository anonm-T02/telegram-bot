import assert from "node:assert/strict";
import test from "node:test";
import { hasQualityReleaseSlot, qualifiesForQuality } from "./referrals.js";

const eligible = {
  activeDays: 7,
  activeSeconds: 1_800,
  validClicks: 300,
  userActive: true,
  riskSafe: true,
};

test("quality referral accepts every exact server-side boundary", () => {
  assert.equal(qualifiesForQuality(eligible), true);
});

test("quality referral rejects each unmet boundary and unsafe risk", () => {
  assert.equal(qualifiesForQuality({ ...eligible, activeDays: 6 }), false);
  assert.equal(qualifiesForQuality({ ...eligible, activeSeconds: 1_799 }), false);
  assert.equal(qualifiesForQuality({ ...eligible, validClicks: 299 }), false);
  assert.equal(qualifiesForQuality({ ...eligible, userActive: false }), false);
  assert.equal(qualifiesForQuality({ ...eligible, riskSafe: false }), false);
});

test("daily quality release cap accepts five and queues the sixth", () => {
  assert.equal(hasQualityReleaseSlot(4), true);
  assert.equal(hasQualityReleaseSlot(5), false);
});
