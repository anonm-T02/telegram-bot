import { createHmac } from "node:crypto";
import { prisma } from "@nova-org/db";
import { env } from "../env.js";
import { hashSessionToken, verifySessionToken } from "./telegramAuth.js";
import {
  adminReplayMatches,
  canAdminMutate,
  isConfiguredAdmin,
  settingValueIsValid,
} from "./adminPolicy.js";

export class AdminAccessError extends Error {
  constructor(readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT") {
    super(code);
    this.name = "AdminAccessError";
  }
}

export type AdminIdentity = { id: string; userId: string; telegramId: bigint; role: string };

export function hashAdminIp(ip: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(ip).digest("hex");
}

export async function authenticateAdmin(rawAuthorization?: string): Promise<AdminIdentity> {
  if (!rawAuthorization?.startsWith("Bearer ")) throw new AdminAccessError("UNAUTHORIZED");
  const token = rawAuthorization.slice(7);
  const claims = verifySessionToken(token, env.SESSION_SECRET);
  const session = await prisma.telegramSession.findFirst({
    where: {
      userId: claims.sub,
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE" },
    },
    select: { userId: true, user: { select: { telegramId: true } } },
  });
  if (!session) throw new AdminAccessError("UNAUTHORIZED");
  if (!isConfiguredAdmin(session.user.telegramId, env.ADMIN_TELEGRAM_IDS)) {
    throw new AdminAccessError("FORBIDDEN");
  }
  const admin = await prisma.adminUser.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, role: "SUPER_ADMIN" },
    update: {},
  });
  if (admin.status !== "ACTIVE") throw new AdminAccessError("FORBIDDEN");
  return {
    id: admin.id,
    userId: session.userId,
    telegramId: session.user.telegramId,
    role: admin.role,
  };
}

export async function getAdminDashboard() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 60_000);
  const [totalUsers, activeSessions, issued, spent, openFraud, rewardGroups, budget] =
    await Promise.all([
      prisma.user.count(),
      prisma.activitySession.groupBy({
        by: ["userId"],
        where: { status: "OPEN", lastHeartbeatAt: { gte: staleBefore } },
      }),
      prisma.wallet.aggregate({ _sum: { totalEarned: true } }),
      prisma.wallet.aggregate({ _sum: { totalSpent: true } }),
      prisma.fraudSignal.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
      prisma.rewardRequest.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.rewardBudget.findUnique({
        where: {
          budgetDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        },
      }),
    ]);
  return {
    generatedAt: now,
    users: { total: totalUsers, online: activeSessions.length },
    coins: {
      issuedMicrocoins: (issued._sum.totalEarned ?? 0n).toString(),
      spentMicrocoins: (spent._sum.totalSpent ?? 0n).toString(),
    },
    fraud: { openSignals: openFraud },
    rewards: {
      byStatus: Object.fromEntries(rewardGroups.map((row) => [row.status, row._count._all])),
      today: budget
        ? {
            limitUnits: budget.dailyLimit,
            reservedUnits: budget.reservedUnits,
            paidUnits: budget.paidUnits,
          }
        : { limitUnits: 50, reservedUnits: 0, paidUnits: 0 },
    },
  };
}

export async function listAdminUsers(input: {
  limit: number;
  cursor?: string;
  status?: "ACTIVE" | "SUSPENDED" | "BLOCKED" | "DELETED";
  search?: string;
}) {
  const rows = await prisma.user.findMany({
    take: input.limit,
    ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
    where: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { username: { contains: input.search, mode: "insensitive" as const } },
              { firstName: { contains: input.search, mode: "insensitive" as const } },
              { referralCode: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      telegramId: true,
      username: true,
      firstName: true,
      status: true,
      createdAt: true,
      wallet: { select: { balance: true, lockedBalance: true, pendingBalance: true } },
      riskScore: { select: { score: true, level: true, calculatedAt: true } },
    },
  });
  return rows.map((row) => ({
    ...row,
    telegramId: row.telegramId.toString(),
    wallet: row.wallet
      ? {
          availableMicrocoins: row.wallet.balance.toString(),
          lockedMicrocoins: row.wallet.lockedBalance.toString(),
          pendingMicrocoins: row.wallet.pendingBalance.toString(),
        }
      : null,
  }));
}

export async function changeUserStatus(input: {
  admin: AdminIdentity;
  targetUserId: string;
  status: "ACTIVE" | "SUSPENDED" | "BLOCKED";
  reason: string;
  idempotencyKey: string;
  ipHash: string;
}) {
  if (!canAdminMutate(input.admin.role, "USER_STATUS")) throw new AdminAccessError("FORBIDDEN");
  if (input.targetUserId === input.admin.userId && input.status !== "ACTIVE") {
    throw new AdminAccessError("FORBIDDEN");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-audit:${input.idempotencyKey}`}, 0))`;
    const existing = await tx.adminAuditLog.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (
        !adminReplayMatches(existing, {
          adminId: input.admin.id,
          action: "USER_STATUS_CHANGED",
          entityId: input.targetUserId,
          payloadKey: "status",
          payloadValue: input.status,
          reason: input.reason,
        })
      ) {
        throw new AdminAccessError("CONFLICT");
      }
      return { duplicate: true, auditId: existing.id };
    }
    const before = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { status: true },
    });
    if (!before) throw new AdminAccessError("NOT_FOUND");
    await tx.user.update({ where: { id: input.targetUserId }, data: { status: input.status } });
    if (input.status !== "ACTIVE") {
      await tx.telegramSession.updateMany({
        where: { userId: input.targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const audit = await tx.adminAuditLog.create({
      data: {
        adminId: input.admin.id,
        action: "USER_STATUS_CHANGED",
        entityType: "User",
        entityId: input.targetUserId,
        idempotencyKey: input.idempotencyKey,
        before,
        after: { status: input.status },
        metadata: { reason: input.reason },
        ipHash: input.ipHash,
      },
    });
    return { duplicate: false, auditId: audit.id, status: input.status };
  });
}

export async function changeSystemSetting(input: {
  admin: AdminIdentity;
  key: string;
  value: boolean | number;
  reason: string;
  idempotencyKey: string;
  ipHash: string;
}) {
  if (!canAdminMutate(input.admin.role, "SETTING")) throw new AdminAccessError("FORBIDDEN");
  if (!settingValueIsValid(input.key, input.value)) throw new AdminAccessError("CONFLICT");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`admin-audit:${input.idempotencyKey}`}, 0))`;
    const existing = await tx.adminAuditLog.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (
        !adminReplayMatches(existing, {
          adminId: input.admin.id,
          action: "SYSTEM_SETTING_CHANGED",
          entityId: input.key,
          payloadKey: "value",
          payloadValue: input.value,
          reason: input.reason,
        })
      ) {
        throw new AdminAccessError("CONFLICT");
      }
      return { duplicate: true, auditId: existing.id };
    }
    if (input.key === "reward.payoutPaused") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('reward-payout-control', 0))`;
    }
    const before = await tx.systemSetting.findUnique({ where: { key: input.key } });
    if (input.key === "reward.dailyLimitUnits" && typeof input.value === "number") {
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const budget = await tx.rewardBudget.findUnique({ where: { budgetDate: today } });
      if (budget && budget.reservedUnits + budget.paidUnits > input.value) {
        throw new AdminAccessError("CONFLICT");
      }
      if (budget) {
        await tx.rewardBudget.update({
          where: { id: budget.id },
          data: { dailyLimit: input.value },
        });
      }
    }
    const setting = await tx.systemSetting.upsert({
      where: { key: input.key },
      create: { key: input.key, value: input.value, updatedBy: input.admin.id },
      update: { value: input.value, updatedBy: input.admin.id },
    });
    const audit = await tx.adminAuditLog.create({
      data: {
        adminId: input.admin.id,
        action: "SYSTEM_SETTING_CHANGED",
        entityType: "SystemSetting",
        entityId: input.key,
        idempotencyKey: input.idempotencyKey,
        before: before ? { value: before.value } : { value: null },
        after: { value: input.value },
        metadata: { reason: input.reason },
        ipHash: input.ipHash,
      },
    });
    return { duplicate: false, auditId: audit.id, setting };
  });
}
