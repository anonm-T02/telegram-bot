import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAdminLoginPayload,
  pkceChallenge,
  verifierMatches,
  adminExchangeDecision,
} from "./adminLoginPolicy.js";

test("admin login verifier is bound to its SHA-256 PKCE challenge", () => {
  const verifier = "A".repeat(43);
  const challenge = pkceChallenge(verifier);
  assert.equal(challenge.length, 43);
  assert.equal(verifierMatches(verifier, challenge), true);
  assert.equal(verifierMatches("B".repeat(43), challenge), false);
});

test("admin challenge exchange rejects pending, expired and replayed challenges", () => {
  assert.equal(adminExchangeDecision("APPROVED", 2_000, 1_000, true), "ALLOW");
  assert.equal(adminExchangeDecision("PENDING", 2_000, 1_000, true), "PENDING");
  assert.equal(adminExchangeDecision("APPROVED", 1_000, 1_000, true), "EXPIRED");
  assert.equal(adminExchangeDecision("CONSUMED", 2_000, 1_000, true), "CONSUMED");
  assert.equal(adminExchangeDecision("APPROVED", 2_000, 1_000, false), "INVALID_VERIFIER");
});

test("Telegram deep-link payload contains only a valid challenge id", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(parseAdminLoginPayload(`admin_${id}`), id);
  assert.equal(parseAdminLoginPayload(`admin_${id}_secret`), null);
  assert.equal(parseAdminLoginPayload("ref_CODE"), null);
});
