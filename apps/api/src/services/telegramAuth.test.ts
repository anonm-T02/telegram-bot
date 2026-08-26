import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createSessionToken,
  TelegramAuthError,
  verifySessionToken,
  verifyTelegramInitData,
} from "./telegramAuth.js";

const BOT_TOKEN = "test-only:bot-token";
const SESSION_SECRET = "test-only-session-secret-with-enough-entropy";
const NOW = 2_000_000_000;

function signedInitData(entries: Array<[string, string]>): string {
  const dataCheckString = [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams([...entries, ["hash", hash]]).toString();
}

function validEntries(): Array<[string, string]> {
  return [
    ["auth_date", String(NOW - 10)],
    ["query_id", "query-for-tests"],
    ["user", JSON.stringify({ id: 42, first_name: "Nova", username: "nova_user" })],
  ];
}

test("accepts a correctly signed, fresh Telegram initData payload", () => {
  const result = verifyTelegramInitData(signedInitData(validEntries()), BOT_TOKEN, {
    nowSeconds: NOW,
  });
  assert.equal(result.user.id, 42);
  assert.equal(result.queryId, "query-for-tests");
});

test("rejects initData whose signed content was modified", () => {
  const initData = signedInitData(validEntries()).replace("nova_user", "attacker");
  assert.throws(
    () => verifyTelegramInitData(initData, BOT_TOKEN, { nowSeconds: NOW }),
    TelegramAuthError,
  );
});

test("rejects stale initData at the configured age boundary", () => {
  const entries: Array<[string, string]> = validEntries().map(([key, value]) => [
    key,
    key === "auth_date" ? String(NOW - 301) : value,
  ]);
  assert.throws(
    () => verifyTelegramInitData(signedInitData(entries), BOT_TOKEN, { nowSeconds: NOW }),
    TelegramAuthError,
  );
});

test("rejects duplicate parameters even when the duplicate is included in the signature", () => {
  const entries = [...validEntries(), ["query_id", "duplicate"]] as Array<[string, string]>;
  assert.throws(
    () => verifyTelegramInitData(signedInitData(entries), BOT_TOKEN, { nowSeconds: NOW }),
    TelegramAuthError,
  );
});

test("verifies an untampered session token and rejects a wrong secret", () => {
  const { token } = createSessionToken({ userId: "user-1", telegramId: "42" }, SESSION_SECRET, {
    nowSeconds: Math.floor(Date.now() / 1_000),
    ttlSeconds: 60,
  });
  assert.equal(verifySessionToken(token, SESSION_SECRET).sub, "user-1");
  assert.throws(() => verifySessionToken(token, "wrong-secret"), TelegramAuthError);
});

test("rejects an expired session token", () => {
  const { token } = createSessionToken({ userId: "user-1", telegramId: "42" }, SESSION_SECRET, {
    nowSeconds: 1,
    ttlSeconds: 1,
  });
  assert.throws(() => verifySessionToken(token, SESSION_SECRET), /Expired session token/);
});
