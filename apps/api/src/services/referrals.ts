import { prisma } from "@nova-org/db";
import { isRewardRiskSafe, refreshRiskScore } from "./risk.js";

export const REFERRAL_REGISTER_REWARD = 500n;
export const REFERRAL_ACTIVE_3_DAYS_REWARD = 500n;
export const REFERRAL_QUALITY_REWARD = 1_000n;
export const REFERRED_USER_QUALITY_REWARD = 500n;
export const QUALITY_ACTIVE_DAYS = 7;
export const QUALITY_ACTIVE_SECONDS = 30 * 60;
export const QUALITY_VALID_CLICKS = 300;
export const QUALITY_RELEASES_PER_DAY = 5;

export function hasQualityReleaseSlot(releasedCount: number): boolean {
  return releasedCount < QUALITY_RELEASES_PER_DAY;
}

export type ReferralMetrics = {
  activeDays: number;
  activeSeconds: number;
  validClicks: number;
  userActive: boolean;
  riskSafe: boolean;
};

export function qualifiesForQuality(metrics: ReferralMetrics): boolean {
  return (
    metrics.userActive &&
    metrics.riskSafe &&
    metrics.activeDays >= QUALITY_ACTIVE_DAYS &&
    metrics.activeSeconds >= QUALITY_ACTIVE_SECONDS &&
    metrics.validClicks >= QUALITY_VALID_CLICKS
  );
}

function utcDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function getMetrics(userId: string) {
  const [activeDaysRows, activity, validClicks, user, risk] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT (h."receivedAt" AT TIME ZONE 'UTC')::date)::bigint AS count
      FROM "Heartbeat" h
      JOIN "ActivitySession" s ON s.id = h."activitySessionId"
      WHERE s."userId" = ${userId} AND h.state = 'ACTIVE' AND h."isVisible" = true
    `,
    prisma.activitySession.aggregate({ where: { userId }, _sum: { activeSeconds: true } }),
    prisma.clickEvent.count({ where: { userId, status: "ACCEPTED" } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } }),
    refreshRiskScore(userId),
  ]);
  return {
    activeDays: Number(activeDaysRows[0]?.count ?? 0n),
    activeSeconds: activity._sum.activeSeconds ?? 0,
    validClicks,
    userActive: user.status === "ACTIVE",
    riskSafe: isRewardRiskSafe(risk.level),
    riskLevel: risk.level,
  };
}

async function releaseMilestones(referralId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`referral:${referralId}`}, 0))`;
    const referral = await tx.referral.findUniqueOrThrow({
      where: { id: referralId },
      include: { milestones: { orderBy: { createdAt: "asc" } } },
    });
    if (referral.status === "REWARDED") return false;

    for (const milestone of referral.milestones) {
      if (milestone.status === "RELEASED") continue;
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: milestone.beneficiaryId },
      });
      const pendingAmount =
        milestone.type === "REFERRER_REGISTER" || milestone.type === "REFERRER_ACTIVE_3_DAYS"
          ? milestone.amount
          : 0n;
      if (pendingAmount > wallet.pendingBalance) {
        throw new Error(`Referral pending balance invariant failed for ${milestone.id}`);
      }
      const transaction = await tx.coinTransaction.create({
        data: {
          userId: milestone.beneficiaryId,
          walletId: wallet.id,
          type: "REFERRAL_MILESTONE_REWARD",
          amount: milestone.amount,
          referenceType: "referral_milestone",
          referenceId: milestone.id,
          metadata: { referralId, milestoneType: milestone.type },
        },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: milestone.amount },
          pendingBalance: { decrement: pendingAmount },
          totalEarned: { increment: milestone.amount },
        },
      });
      await tx.referralMilestone.update({
        where: { id: milestone.id },
        data: { status: "RELEASED", releasedAt: now, transactionId: transaction.id },
      });
    }
    await tx.referral.update({
      where: { id: referralId },
      data: {
        status: "REWARDED",
        reward: {
          increment: referral.milestones
            .filter((item) => item.beneficiaryId === referral.referrerUserId)
            .reduce((sum, item) => sum + item.amount, 0n),
        },
      },
    });
    return true;
  });
}

export async function evaluateReferral(referralId: string, now = new Date()) {
  const referral = await prisma.referral.findUniqueOrThrow({ where: { id: referralId } });
  const metrics = await getMetrics(referral.referredUserId);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`referral:${referralId}`}, 0))`;
    await tx.referral.update({
      where: { id: referralId },
      data: {
        activeDayCount: metrics.activeDays,
        activeSeconds: metrics.activeSeconds,
        validClickCount: metrics.validClicks,
        riskCheckedAt: now,
        status: metrics.activeDays > 0 ? "ACTIVE" : undefined,
      },
    });
    if (metrics.activeDays >= 3) {
      const changed = await tx.referralMilestone.updateMany({
        where: { referralId, type: "REFERRER_ACTIVE_3_DAYS", status: "PENDING" },
        data: { status: "ELIGIBLE", eligibleAt: now },
      });
      if (changed.count === 1) {
        await tx.wallet.update({
          where: { userId: referral.referrerUserId },
          data: { pendingBalance: { increment: REFERRAL_ACTIVE_3_DAYS_REWARD } },
        });
      }
    }
  });

  if (!qualifiesForQuality(metrics)) return { metrics, released: false };
  const releaseDate = utcDate(now);
  const canRelease = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`referral-release:${referral.referrerUserId}:${releaseDate.toISOString()}`}, 0))`;
    const currentReferral = await tx.referral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true },
    });
    // QUALIFIED means a daily slot was already reserved. Retry only the
    // idempotent ledger release without consuming another slot.
    if (currentReferral.status === "QUALIFIED") return true;
    if (currentReferral.status === "REWARDED") return false;
    const counter = await tx.referralReleaseCounter.upsert({
      where: { referrerId_releaseDate: { referrerId: referral.referrerUserId, releaseDate } },
      create: { referrerId: referral.referrerUserId, releaseDate },
      update: {},
    });
    const slotAvailable = hasQualityReleaseSlot(counter.releasedCount);
    await tx.referralMilestone.updateMany({
      where: {
        referralId,
        type: { in: ["REFERRER_QUALITY_7_DAYS", "REFERRED_USER_QUALITY"] },
        status: { in: ["PENDING", "QUEUED"] },
      },
      data: slotAvailable
        ? { status: "ELIGIBLE", eligibleAt: now, releaseDate }
        : { status: "QUEUED", eligibleAt: now, queuedAt: now, releaseDate },
    });
    await tx.referral.update({
      where: { id: referralId },
      data: {
        qualityQualifiedAt: now,
        status: slotAvailable ? "QUALIFIED" : "QUALITY_QUEUED",
      },
    });
    if (slotAvailable) {
      await tx.referralReleaseCounter.update({
        where: { id: counter.id },
        data: { releasedCount: { increment: 1 } },
      });
    }
    return slotAvailable;
  });
  return { metrics, released: canRelease ? await releaseMilestones(referralId, now) : false };
}

export async function evaluateReferralsForUser(referrerId: string, now = new Date()) {
  const referrals = await prisma.referral.findMany({
    where: { referrerUserId: referrerId, status: { notIn: ["REWARDED", "REJECTED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  for (const referral of referrals) await evaluateReferral(referral.id, now);
}

export async function getReferralDashboard(userId: string, botUsername: string, limit = 25) {
  await evaluateReferralsForUser(userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      referralLink: true,
      referralsMade: {
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          milestones: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  const [milestones, invitedCount] = await Promise.all([
    prisma.referralMilestone.findMany({
      where: { referral: { referrerUserId: userId }, beneficiaryId: userId },
      select: { status: true, amount: true, type: true, releaseDate: true },
    }),
    prisma.referral.count({ where: { referrerUserId: userId } }),
  ]);
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  const today = utcDate(new Date());
  const releaseCounter = await prisma.referralReleaseCounter.findUnique({
    where: { referrerId_releaseDate: { referrerId: userId, releaseDate: today } },
  });
  const referralCode = user.referralLink?.code ?? user.referralCode;
  const stats = {
    invitedCount,
    pendingCount: milestones.filter(
      (item) => item.status === "PENDING" || item.status === "ELIGIBLE",
    ).length,
    availableCount: milestones.filter((item) => item.status === "RELEASED").length,
    queuedCount: milestones.filter((item) => item.status === "QUEUED").length,
    totalPending: wallet.pendingBalance.toString(),
    totalAvailable: milestones
      .filter((item) => item.status === "RELEASED")
      .reduce((sum, item) => sum + item.amount, 0n)
      .toString(),
    qualityReleasedToday: releaseCounter?.releasedCount ?? 0,
  };
  return {
    referralCode,
    referralLink: `https://t.me/${botUsername}?start=ref_${referralCode}`,
    stats,
    referrals: user.referralsMade.map((item) => ({
      id: item.id,
      status: item.status,
      createdAt: item.createdAt,
      metrics: {
        activeDays: item.activeDayCount,
        activeSeconds: item.activeSeconds,
        validClicks: item.validClickCount,
      },
      milestones: item.milestones.map((milestone) => ({
        type: milestone.type,
        status: milestone.status,
        amountMicrocoins: milestone.amount.toString(),
        eligibleAt: milestone.eligibleAt,
        releasedAt: milestone.releasedAt,
      })),
    })),
  };
}
