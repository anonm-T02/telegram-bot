import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedBrowserOrigins,
  consumeAuthRateLimit,
  internalSecretMatches,
} from "./appSecurity.js";

test("browser CORS allowlist contains only configured application origins", () => {
  assert.deepEqual(
    allowedBrowserOrigins("https://app.example.com/path", "https://admin.example.com/"),
    ["https://app.example.com", "https://admin.example.com"],
  );
});

test("authentication endpoints apply a bounded fixed-window rate limit", () => {
  const key = `auth-test-${Date.now()}`;
  for (let index = 0; index < 30; index += 1) assert.equal(consumeAuthRateLimit(key, 1_000), true);
  assert.equal(consumeAuthRateLimit(key, 1_000), false);
  assert.equal(consumeAuthRateLimit(key, 61_000), true);
});

test("internal API secret comparison rejects missing, different and length-mismatched values", () => {
  assert.equal(internalSecretMatches("a".repeat(32), "a".repeat(32)), true);
  assert.equal(internalSecretMatches("b".repeat(32), "a".repeat(32)), false);
  assert.equal(internalSecretMatches("short", "a".repeat(32)), false);
  assert.equal(internalSecretMatches(undefined, "a".repeat(32)), false);
});
