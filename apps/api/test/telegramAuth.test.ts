import assert from "node:assert/strict";
import test from "node:test";
import {
  createRefreshToken,
  hashSessionToken,
  refreshSession,
  TelegramAuthError,
  verifyRefreshToken,
  type AuthUserRepository,
} from "../src/services/telegramAuth.js";

const secret = "test-session-secret-that-is-long-enough";

function repository(
  storedHash: string,
): AuthUserRepository & { revoked: boolean; rotated: boolean } {
  return {
    revoked: false,
    rotated: false,
    async upsertTelegramUser() {
      return { userId: "user-1", status: "ACTIVE" };
    },
    async saveSession() {},
    async findRefreshSession() {
      return {
        id: "session-1",
        userId: "user-1",
        telegramId: 42n,
        status: "ACTIVE",
        refreshTokenHash: storedHash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      };
    },
    async rotateSession(input) {
      if (input.previousRefreshTokenHash !== storedHash) return false;
      this.rotated = true;
      return true;
    },
    async revokeSession() {
      this.revoked = true;
    },
  };
}

test("refresh tokens are signed, typed, and expire", () => {
  const created = createRefreshToken(
    { userId: "user-1", telegramId: "42", sessionId: "session-1" },
    secret,
    { nowSeconds: 100, ttlSeconds: 10 },
  );
  assert.equal(verifyRefreshToken(created.token, secret, 105).sid, "session-1");
  assert.throws(() => verifyRefreshToken(created.token, secret, 110), TelegramAuthError);
  assert.throws(() => verifyRefreshToken(`${created.token}x`, secret, 105), TelegramAuthError);
});

test("refresh rotates both credentials without persisting the raw refresh token", async () => {
  const original = createRefreshToken(
    { userId: "user-1", telegramId: "42", sessionId: "session-1" },
    secret,
  );
  const users = repository(hashSessionToken(original.token));
  const result = await refreshSession(original.token, { sessionSecret: secret, users });
  assert.equal(users.rotated, true);
  assert.notEqual(result.refreshToken, original.token);
  assert.equal(result.userId, "user-1");
});

test("refresh token reuse revokes the session", async () => {
  const original = createRefreshToken(
    { userId: "user-1", telegramId: "42", sessionId: "session-1" },
    secret,
  );
  const users = repository(hashSessionToken("a-different-token"));
  await assert.rejects(
    refreshSession(original.token, { sessionSecret: secret, users }),
    TelegramAuthError,
  );
  assert.equal(users.revoked, true);
});

test("non-active users cannot refresh and their session is revoked", async () => {
  const original = createRefreshToken(
    { userId: "user-1", telegramId: "42", sessionId: "session-1" },
    secret,
  );
  const users = repository(hashSessionToken(original.token));
  users.findRefreshSession = async () => ({
    id: "session-1",
    userId: "user-1",
    telegramId: 42n,
    status: "BLOCKED",
    refreshTokenHash: hashSessionToken(original.token),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  });
  await assert.rejects(
    refreshSession(original.token, { sessionSecret: secret, users }),
    TelegramAuthError,
  );
  assert.equal(users.revoked, true);
});
