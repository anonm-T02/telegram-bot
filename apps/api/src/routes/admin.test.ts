import assert from "node:assert/strict";
import test from "node:test";
import { consumeAdminRateLimit } from "../services/adminRateLimit.js";

test("admin route limiter rejects requests beyond its fixed window", () => {
  const key = `test-${Date.now()}`;
  for (let index = 0; index < 120; index += 1) {
    assert.equal(consumeAdminRateLimit(key, 1_000), true);
  }
  assert.equal(consumeAdminRateLimit(key, 1_000), false);
  assert.equal(consumeAdminRateLimit(key, 61_000), true);
});
