import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { telegramWebAppUserSchema, type TelegramWebAppUser } from "@nova-org/validation";

const DEFAULT_MAX_AUTH_AGE_SECONDS = 300;
const DEFAULT_SESSION_TTL_SECONDS = 900;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export class TelegramAuthError extends Error {
  constructor(message = "Invalid or expired Telegram authentication data") {
    super(message);
    this.name = "TelegramAuthError";
  }
}

export interface VerifiedTelegramInitData {
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
}

export interface AuthUserRepository {
  upsertTelegramUser(
    user: TelegramWebAppUser,
    startParam?: string,
  ): Promise<{ userId: string; status: "ACTIVE" | "SUSPENDED" | "BLOCKED" | "DELETED" }>;
  saveSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findRefreshSession(sessionId: string): Promise<{
    id: string;
    userId: string;
    telegramId: bigint;
    status: "ACTIVE" | "SUSPENDED" | "BLOCKED" | "DELETED";
    refreshTokenHash: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null>;
  rotateSession(input: {
    sessionId: string;
    previousRefreshTokenHash: string;
    tokenHash: string;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<boolean>;
  revokeSession(sessionId: string): Promise<void>;
}

export interface SessionClaims {
  sub: string;
  telegramId: string;
  iat: number;
  exp: number;
  jti: string;
}

interface RefreshClaims {
  sub: string;
  telegramId: string;
  sid: string;
  iat: number;
  exp: number;
  typ: "refresh";
  jti: string;
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: { nowSeconds?: number; maxAgeSeconds?: number } = {},
): VerifiedTelegramInitData {
  const params = new URLSearchParams(initData);
  const hashes = params.getAll("hash");
  if (hashes.length !== 1 || !/^[a-f\d]{64}$/i.test(hashes[0] ?? "")) {
    throw new TelegramAuthError();
  }

  const seen = new Set<string>();
  const data: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    if (seen.has(key)) throw new TelegramAuthError();
    seen.add(key);
    data.push([key, value]);
  }
  data.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = data.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = hmac("WebAppData", botToken);
  const expectedHash = hmac(secretKey, dataCheckString);
  const suppliedHash = Buffer.from(hashes[0]!, "hex");
  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) {
    throw new TelegramAuthError();
  }

  const authDateText = params.get("auth_date");
  if (!authDateText || !/^\d+$/.test(authDateText)) throw new TelegramAuthError();
  const authDate = Number(authDateText);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AUTH_AGE_SECONDS;
  if (!Number.isSafeInteger(authDate) || authDate > now + 30 || now - authDate > maxAge) {
    throw new TelegramAuthError();
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new TelegramAuthError();
  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(rawUser);
  } catch {
    throw new TelegramAuthError();
  }
  const user = telegramWebAppUserSchema.safeParse(parsedUser);
  if (!user.success) throw new TelegramAuthError();

  return {
    user: user.data,
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
  };
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createSessionToken(
  input: { userId: string; telegramId: string },
  secret: string,
  options: { nowSeconds?: number; ttlSeconds?: number } = {},
): { token: string; expiresAt: string } {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const ttl = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims: SessionClaims = {
    sub: input.userId,
    telegramId: input.telegramId,
    iat: now,
    exp: now + ttl,
    jti: randomUUID(),
  };
  const payload = encode(claims);
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return {
    token: `${header}.${payload}.${signature}`,
    expiresAt: new Date(claims.exp * 1_000).toISOString(),
  };
}

export function createRefreshToken(
  input: { userId: string; telegramId: string; sessionId: string },
  secret: string,
  options: { nowSeconds?: number; ttlSeconds?: number } = {},
): { token: string; expiresAt: string } {
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const ttl = options.ttlSeconds ?? DEFAULT_REFRESH_TTL_SECONDS;
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims: RefreshClaims = {
    sub: input.userId,
    telegramId: input.telegramId,
    sid: input.sessionId,
    iat: now,
    exp: now + ttl,
    typ: "refresh",
    jti: randomUUID(),
  };
  const payload = encode(claims);
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return {
    token: `${header}.${payload}.${signature}`,
    expiresAt: new Date(claims.exp * 1_000).toISOString(),
  };
}

export function verifyRefreshToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): RefreshClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TelegramAuthError("Invalid refresh token");
  const [header, payload, suppliedSignature] = parts as [string, string, string];
  const expectedSignature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new TelegramAuthError("Invalid refresh token");
  let claims: RefreshClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RefreshClaims;
  } catch {
    throw new TelegramAuthError("Invalid refresh token");
  }
  if (
    !claims.sub ||
    !claims.telegramId ||
    !claims.sid ||
    !claims.jti ||
    claims.typ !== "refresh" ||
    claims.exp <= nowSeconds
  ) {
    throw new TelegramAuthError("Expired refresh token");
  }
  return claims;
}

export function verifySessionToken(token: string, secret: string): SessionClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TelegramAuthError("Invalid session token");
  const [header, payload, suppliedSignature] = parts as [string, string, string];
  const expectedSignature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new TelegramAuthError("Invalid session token");
  }
  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
  } catch {
    throw new TelegramAuthError("Invalid session token");
  }
  const now = Math.floor(Date.now() / 1_000);
  if (!claims.sub || !claims.telegramId || !claims.jti || claims.exp <= now) {
    throw new TelegramAuthError("Expired session token");
  }
  return claims;
}

export function hashSessionToken(token: string): string {
  return createHmac("sha256", "nova-org-session-token").update(token).digest("hex");
}

export async function authenticateTelegram(
  initData: string,
  dependencies: { botToken: string; sessionSecret: string; users: AuthUserRepository },
): Promise<{ token: string; refreshToken: string; expiresAt: string; userId: string }> {
  const verified = verifyTelegramInitData(initData, dependencies.botToken);
  const persisted = await dependencies.users.upsertTelegramUser(verified.user, verified.startParam);
  if (persisted.status !== "ACTIVE") throw new TelegramAuthError("User account is not active");
  const session = createSessionToken(
    { userId: persisted.userId, telegramId: String(verified.user.id) },
    dependencies.sessionSecret,
  );
  const sessionId = randomUUID();
  const refresh = createRefreshToken(
    { userId: persisted.userId, telegramId: String(verified.user.id), sessionId },
    dependencies.sessionSecret,
  );
  await dependencies.users.saveSession({
    id: sessionId,
    userId: persisted.userId,
    tokenHash: hashSessionToken(session.token),
    refreshTokenHash: hashSessionToken(refresh.token),
    expiresAt: new Date(refresh.expiresAt),
  });
  return { ...session, refreshToken: refresh.token, userId: persisted.userId };
}

export async function refreshSession(
  rawRefreshToken: string,
  dependencies: { sessionSecret: string; users: AuthUserRepository },
): Promise<{ token: string; refreshToken: string; expiresAt: string; userId: string }> {
  const claims = verifyRefreshToken(rawRefreshToken, dependencies.sessionSecret);
  const session = await dependencies.users.findRefreshSession(claims.sid);
  if (!session || session.userId !== claims.sub || String(session.telegramId) !== claims.telegramId)
    throw new TelegramAuthError();
  const suppliedHash = hashSessionToken(rawRefreshToken);
  if (
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.refreshTokenHash !== suppliedHash
  ) {
    await dependencies.users.revokeSession(claims.sid);
    throw new TelegramAuthError("Refresh token reuse detected");
  }
  if (session.status !== "ACTIVE") {
    await dependencies.users.revokeSession(claims.sid);
    throw new TelegramAuthError("User account is not active");
  }
  const access = createSessionToken(
    { userId: session.userId, telegramId: claims.telegramId },
    dependencies.sessionSecret,
  );
  const refresh = createRefreshToken(
    { userId: session.userId, telegramId: claims.telegramId, sessionId: session.id },
    dependencies.sessionSecret,
  );
  const rotated = await dependencies.users.rotateSession({
    sessionId: session.id,
    previousRefreshTokenHash: suppliedHash,
    tokenHash: hashSessionToken(access.token),
    refreshTokenHash: hashSessionToken(refresh.token),
    expiresAt: new Date(refresh.expiresAt),
  });
  if (!rotated) {
    await dependencies.users.revokeSession(session.id);
    throw new TelegramAuthError("Refresh token reuse detected");
  }
  return { ...access, refreshToken: refresh.token, userId: session.userId };
}

export async function logoutSession(
  rawRefreshToken: string,
  dependencies: { sessionSecret: string; users: AuthUserRepository },
): Promise<string> {
  const claims = verifyRefreshToken(rawRefreshToken, dependencies.sessionSecret);
  await dependencies.users.revokeSession(claims.sid);
  return claims.sub;
}
