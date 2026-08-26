import { prisma } from "@nova-org/db";
import { refreshRiskScore, type RiskLevel } from "./risk.js";

export const CLICK_COOLDOWN_MS = 2_000;
export const CLICK_DAILY_LIMIT = 1_000;
export const CLICK_REWARD_MICROCOINS = 1n;
const ACTIVE_SESSION_MAX_AGE_MS = 60_000;

export type ClickRejection =
  "COOLDOWN" | "DAILY_LIMIT" | "SESSION_NOT_REWARDABLE" | "SESSION_INACTIVE" | "RISK_REJECTED";

export function clickRiskRejection(level: RiskLevel): "RISK_REJECTED" | null {
  return level === "REVIEW_REQUIRED" || level === "TEMPORARY_REWARD_HOLD" ? "RISK_REJECTED" : null;
}

export interface ClickDecision {
  accepted: boolean;
  rejectionCode?: "COOLDOWN" | "DAILY_LIMIT";
  nextAllowedAt: Date | null;
}

export type ClickAuth = { userId: string; sessionId: string };

type ActivityEligibilityInput = {
  state: string;
  status: string;
  isRewardable: boolean;
  lastHeartbeatAt: Date;
  latestHeartbeat: { isVisible: boolean } | undefined;
};

export function activityRejection(
  activity: ActivityEligibilityInput | null,
  now: Date,
): "SESSION_NOT_REWARDABLE" | "SESSION_INACTIVE" | null {
  if (!activity || activity.status !== "OPEN") return "SESSION_INACTIVE";
  if (!activity.isRewardable) return "SESSION_NOT_REWARDABLE";
  if (
    activity.state !== "ACTIVE" ||
    activity.lastHeartbeatAt.getTime() < now.getTime() - ACTIVE_SESSION_MAX_AGE_MS ||
    !activity.latestHeartbeat?.isVisible
  ) {
    return "SESSION_INACTIVE";
  }
  return null;
}

export function utcDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function decideClick(
  acceptedCount: number,
  lastAcceptedAt: Date | null,
  now: Date,
): ClickDecision {
  if (acceptedCount >= CLICK_DAILY_LIMIT) {
    return { accepted: false, rejectionCode: "DAILY_LIMIT", nextAllowedAt: null };
  }
  if (lastAcceptedAt) {
    const nextAllowedAt = new Date(lastAcceptedAt.getTime() + CLICK_COOLDOWN_MS);
    if (now < nextAllowedAt) {
      return { accepted: false, rejectionCode: "COOLDOWN", nextAllowedAt };
    }
  }
  return { accepted: true, nextAllowedAt: new Date(now.getTime() + CLICK_COOLDOWN_MS) };
}

export type ClickResult = {
  requestId: string;
  accepted: boolean;
  duplicate: boolean;
  rejectionCode?: ClickRejection;
  rewardMicrocoins: string;
  acceptedAt: Date | null;
  dailyAccepted: number;
  nextAllowedAt: Date | null;
  balanceMicrocoins: string;
};

function resultFromEvent(
  event: {
    requestId: string;
    status: "ACCEPTED" | "REJECTED";
    rejectionCode: ClickRejection | "USER_INELIGIBLE" | "RISK_REJECTED" | null;
    rewardAmount: bigint;
    acceptedAt: Date | null;
  },
  dailyAccepted: number,
  nextAllowedAt: Date | null,
  balance: bigint,
): ClickResult {
  return {
    requestId: event.requestId,
    accepted: event.status === "ACCEPTED",
    duplicate: true,
    ...(event.rejectionCode ? { rejectionCode: event.rejectionCode as ClickRejection } : {}),
    rewardMicrocoins: event.rewardAmount.toString(),
    acceptedAt: event.acceptedAt,
    dailyAccepted,
    nextAllowedAt,
    balanceMicrocoins: balance.toString(),
  };
}

export async function processClick(auth: ClickAuth, requestId: string, now = new Date()) {
  const { userId, sessionId } = auth;
  const clickDate = utcDate(now);
  // Refresh from server-owned signals before entering the financial transaction.
  // The transaction below re-reads the persisted decision while holding the user lock.
  await refreshRiskScore(userId, now);
  return prisma.$transaction(async (tx): Promise<ClickResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`user:${userId}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`click:${requestId}`}, 0))`;

    const existing = await tx.clickEvent.findUnique({ where: { requestId } });
    if (existing) {
      // A request id belongs to exactly one user. Never leak another user's event.
      if (existing.userId !== userId) throw new ClickRequestConflictError();
      const counter = await tx.clickDailyCounter.findUnique({
        where: { userId_clickDate: { userId, clickDate: existing.clickDate } },
      });
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId },
        select: { balance: true },
      });
      const nextAllowedAt =
        existing.status === "ACCEPTED" && existing.acceptedAt
          ? new Date(existing.acceptedAt.getTime() + CLICK_COOLDOWN_MS)
          : null;
      return resultFromEvent(existing, counter?.acceptedCount ?? 0, nextAllowedAt, wallet.balance);
    }

    const activity = await tx.activitySession.findUnique({
      where: { telegramSessionId: sessionId },
      include: { heartbeats: { orderBy: { receivedAt: "desc" }, take: 1 } },
    });
    if (activity?.userId !== userId) throw new ClickSessionError("SESSION_INACTIVE");
    const eligibilityError = activityRejection(
      activity ? { ...activity, latestHeartbeat: activity.heartbeats[0] } : null,
      now,
    );
    if (eligibilityError) throw new ClickSessionError(eligibilityError);
    if (!activity) throw new ClickSessionError("SESSION_INACTIVE");

    const counter = await tx.clickDailyCounter.upsert({
      where: { userId_clickDate: { userId, clickDate } },
      create: { userId, clickDate },
      update: {},
    });
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true },
    });
    if (!wallet) throw new Error(`Wallet missing for user ${userId}`);
    const risk = await tx.riskScore.findUnique({ where: { userId }, select: { level: true } });
    const riskRejection = clickRiskRejection(risk?.level ?? "NORMAL");
    if (riskRejection) {
      await tx.clickEvent.create({
        data: {
          requestId,
          userId,
          activitySessionId: activity.id,
          status: "REJECTED",
          rejectionCode: riskRejection,
          rewardAmount: 0n,
          clickDate,
          serverReceivedAt: now,
        },
      });
      return {
        requestId,
        accepted: false,
        duplicate: false,
        rejectionCode: riskRejection,
        rewardMicrocoins: "0",
        acceptedAt: null,
        dailyAccepted: counter.acceptedCount,
        nextAllowedAt: null,
        balanceMicrocoins: wallet.balance.toString(),
      };
    }
    const decision = decideClick(counter.acceptedCount, counter.lastAcceptedAt, now);
    if (!decision.accepted) {
      await tx.clickEvent.create({
        data: {
          requestId,
          userId,
          activitySessionId: activity.id,
          status: "REJECTED",
          rejectionCode: decision.rejectionCode,
          rewardAmount: 0n,
          clickDate,
          serverReceivedAt: now,
        },
      });
      return {
        requestId,
        accepted: false,
        duplicate: false,
        rejectionCode: decision.rejectionCode,
        rewardMicrocoins: "0",
        acceptedAt: null,
        dailyAccepted: counter.acceptedCount,
        nextAllowedAt: decision.nextAllowedAt,
        balanceMicrocoins: wallet.balance.toString(),
      };
    }

    const event = await tx.clickEvent.create({
      data: {
        requestId,
        userId,
        activitySessionId: activity.id,
        status: "ACCEPTED",
        rewardAmount: CLICK_REWARD_MICROCOINS,
        clickDate,
        serverReceivedAt: now,
        acceptedAt: now,
      },
    });
    await tx.coinTransaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: "CLICK_REWARD",
        amount: CLICK_REWARD_MICROCOINS,
        referenceType: "click_event",
        referenceId: event.id,
        clickEventId: event.id,
        metadata: { requestId },
      },
    });
    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: { increment: CLICK_REWARD_MICROCOINS },
        totalEarned: { increment: CLICK_REWARD_MICROCOINS },
      },
    });
    const updatedCounter = await tx.clickDailyCounter.update({
      where: { id: counter.id },
      data: {
        acceptedCount: { increment: 1 },
        totalReward: { increment: CLICK_REWARD_MICROCOINS },
        lastAcceptedAt: now,
      },
    });
    return {
      requestId,
      accepted: true,
      duplicate: false,
      rewardMicrocoins: CLICK_REWARD_MICROCOINS.toString(),
      acceptedAt: now,
      dailyAccepted: updatedCounter.acceptedCount,
      nextAllowedAt: decision.nextAllowedAt,
      balanceMicrocoins: updatedWallet.balance.toString(),
    };
  });
}

export async function getClickStatus(auth: ClickAuth, now = new Date()) {
  const { userId, sessionId } = auth;
  await refreshRiskScore(userId, now);
  const [counter, wallet, activity, risk] = await Promise.all([
    prisma.clickDailyCounter.findUnique({
      where: { userId_clickDate: { userId, clickDate: utcDate(now) } },
    }),
    prisma.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } }),
    prisma.activitySession.findUnique({
      where: { telegramSessionId: sessionId },
      include: { heartbeats: { orderBy: { receivedAt: "desc" }, take: 1 } },
    }),
    prisma.riskScore.findUnique({ where: { userId }, select: { level: true } }),
  ]);
  const decision = decideClick(counter?.acceptedCount ?? 0, counter?.lastAcceptedAt ?? null, now);
  const sessionRejection = activityRejection(
    activity?.userId === userId ? { ...activity, latestHeartbeat: activity.heartbeats[0] } : null,
    now,
  );
  const dailyAccepted = counter?.acceptedCount ?? 0;
  const riskRejection = clickRiskRejection(risk?.level ?? "NORMAL");
  return {
    dailyAccepted,
    dailyRemaining: Math.max(0, CLICK_DAILY_LIMIT - dailyAccepted),
    nextAllowedAt: decision.nextAllowedAt,
    canClick: decision.accepted && sessionRejection === null && riskRejection === null,
    sessionEligible: sessionRejection === null,
    ...(sessionRejection ? { sessionRejection } : {}),
    ...(riskRejection ? { riskRejection } : {}),
    balanceMicrocoins: wallet.balance.toString(),
  };
}

export class ClickSessionError extends Error {
  constructor(readonly code: "SESSION_NOT_REWARDABLE" | "SESSION_INACTIVE") {
    super(code);
    this.name = "ClickSessionError";
  }
}

export class ClickRequestConflictError extends Error {
  constructor() {
    super("Request ID already belongs to another user");
    this.name = "ClickRequestConflictError";
  }
}
