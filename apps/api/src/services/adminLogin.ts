import { randomUUID } from "node:crypto";
import { prisma } from "@nova-org/db";
import { env } from "../env.js";
import { isConfiguredAdmin } from "./adminPolicy.js";
import { createSessionToken, hashSessionToken } from "./telegramAuth.js";
import { adminExchangeDecision, verifierMatches } from "./adminLoginPolicy.js";

const CHALLENGE_TTL_MS = 5 * 60_000;
const ADMIN_SESSION_TTL_SECONDS = 10 * 60;

export class AdminLoginError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "PENDING"
      | "EXPIRED"
      | "CONSUMED"
      | "INVALID_VERIFIER"
      | "FORBIDDEN"
      | "CONFLICT",
  ) {
    super(code);
    this.name = "AdminLoginError";
  }
}

export async function createAdminLoginChallenge(codeChallenge: string, now = new Date()) {
  const challenge = await prisma.adminLoginChallenge.create({
    data: {
      id: randomUUID(),
      codeChallenge,
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    },
  });
  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    botDeepLink: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=admin_${challenge.id}`,
  };
}

export async function approveAdminLoginChallenge(
  challengeId: string,
  telegramId: bigint,
  now = new Date(),
) {
  if (!isConfiguredAdmin(telegramId, env.ADMIN_TELEGRAM_IDS)) {
    throw new AdminLoginError("FORBIDDEN");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-login:${challengeId}`}, 0))`;
    const challenge = await tx.adminLoginChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new AdminLoginError("NOT_FOUND");
    if (challenge.expiresAt <= now) {
      throw new AdminLoginError("EXPIRED");
    }
    const user = await tx.user.findUnique({ where: { telegramId } });
    if (!user || user.status !== "ACTIVE") throw new AdminLoginError("FORBIDDEN");
    if (challenge.status === "APPROVED") {
      if (challenge.approvedByUserId !== user.id) throw new AdminLoginError("CONFLICT");
      return { approved: true, duplicate: true };
    }
    if (challenge.status === "CONSUMED") throw new AdminLoginError("CONSUMED");
    if (challenge.status !== "PENDING") throw new AdminLoginError("EXPIRED");
    const admin = await tx.adminUser.upsert({
      where: { userId: user.id },
      create: { userId: user.id, role: "SUPER_ADMIN" },
      update: {},
    });
    if (admin.status !== "ACTIVE") throw new AdminLoginError("FORBIDDEN");
    await tx.adminLoginChallenge.update({
      where: { id: challengeId },
      data: { status: "APPROVED", approvedByUserId: user.id, approvedAt: now },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "ADMIN_LOGIN_APPROVED",
        entityType: "AdminLoginChallenge",
        entityId: challengeId,
        idempotencyKey: `admin-login-approve:${challengeId}`,
        after: { status: "APPROVED" },
        metadata: { channel: "TELEGRAM_BOT" },
      },
    });
    return { approved: true, duplicate: false };
  });
}

export async function exchangeAdminLoginChallenge(
  input: { challengeId: string; codeVerifier: string; ipHash: string; userAgent?: string },
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-login:${input.challengeId}`}, 0))`;
    const challenge = await tx.adminLoginChallenge.findUnique({ where: { id: input.challengeId } });
    if (!challenge) throw new AdminLoginError("NOT_FOUND");
    const decision = adminExchangeDecision(
      challenge.status,
      challenge.expiresAt.getTime(),
      now.getTime(),
      verifierMatches(input.codeVerifier, challenge.codeChallenge),
    );
    if (decision !== "ALLOW") throw new AdminLoginError(decision);
    const user = challenge.approvedByUserId
      ? await tx.user.findUnique({ where: { id: challenge.approvedByUserId } })
      : null;
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !isConfiguredAdmin(user.telegramId, env.ADMIN_TELEGRAM_IDS)
    ) {
      throw new AdminLoginError("FORBIDDEN");
    }
    const admin = await tx.adminUser.findUnique({ where: { userId: user.id } });
    if (!admin || admin.status !== "ACTIVE") throw new AdminLoginError("FORBIDDEN");
    const session = createSessionToken(
      { userId: user.id, telegramId: user.telegramId.toString() },
      env.SESSION_SECRET,
      { ttlSeconds: ADMIN_SESSION_TTL_SECONDS },
    );
    await tx.telegramSession.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        tokenHash: hashSessionToken(session.token),
        ipHash: input.ipHash,
        userAgent: input.userAgent?.slice(0, 500),
        expiresAt: new Date(session.expiresAt),
      },
    });
    await tx.adminLoginChallenge.update({
      where: { id: input.challengeId },
      data: { status: "CONSUMED", consumedAt: now },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "ADMIN_LOGIN_EXCHANGED",
        entityType: "AdminLoginChallenge",
        entityId: input.challengeId,
        idempotencyKey: `admin-login-exchange:${input.challengeId}`,
        before: { status: "APPROVED" },
        after: { status: "CONSUMED" },
        ipHash: input.ipHash,
      },
    });
    return { token: session.token, expiresAt: session.expiresAt };
  });
}
