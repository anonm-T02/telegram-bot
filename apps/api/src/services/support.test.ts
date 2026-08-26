import assert from "node:assert/strict";
import test from "node:test";
import { findFaqAnswer } from "./support.js";
import { selectDeterministicTool } from "./supportAi.js";
import { executeSupportTool, isAllowedSupportTool } from "./supportTools.js";
import { consumeSupportMutationLimit } from "./supportRateLimit.js";

const faq = [
  {
    slug: "click",
    question: "Click limiti qancha?",
    answer: "Kuniga 1000 ta.",
    keywords: ["click", "limit"],
  },
  {
    slug: "reward",
    question: "Mukofot qanday olinadi?",
    answer: "Avval reward so‘rovi yuboriladi.",
    keywords: ["mukofot", "reward"],
  },
];

test("FAQ matching runs before provider fallback and returns deterministic content", () => {
  assert.equal(findFaqAnswer("Click limitini ayting", faq)?.slug, "click");
  assert.equal(findFaqAnswer("Tushunarsiz boshqa savol", faq), null);
});

test("support mutations are bounded per request source", () => {
  const key = `support-test-${Date.now()}`;
  for (let index = 0; index < 30; index += 1) {
    assert.equal(consumeSupportMutationLimit(key, 1_000), true);
  }
  assert.equal(consumeSupportMutationLimit(key, 1_000), false);
  assert.equal(consumeSupportMutationLimit(key, 61_000), true);
});

test("deterministic provider can only select read-only account tools", () => {
  assert.equal(selectDeterministicTool("balans qancha"), "get_my_balance");
  assert.equal(selectDeterministicTool("referral holati"), "get_my_referral_status");
  assert.equal(selectDeterministicTool("parolimni almashtir"), null);
});

test("support tool allowlist rejects arbitrary tools before database access", async () => {
  assert.equal(isAllowedSupportTool("get_my_balance"), true);
  assert.equal(isAllowedSupportTool("set_balance"), false);
  await assert.rejects(
    executeSupportTool("authenticated-user", "set_balance", {
      userId: "victim-user",
      amount: 999_999,
    }),
    /SUPPORT_TOOL_NOT_ALLOWED/,
  );
  await assert.rejects(
    executeSupportTool("authenticated-user", "create_support_ticket", {
      subject: "x",
      message: "x",
      idempotencyKey: "bad key",
    }),
    /INVALID_SUPPORT_TOOL_ARGUMENTS/,
  );
});
