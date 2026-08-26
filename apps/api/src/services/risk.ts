import { prisma } from "@nova-org/db";

export const RISK_MODEL_VERSION = "referral-v1";

export type RiskLevel = "NORMAL" | "WATCH" | "REVIEW_REQUIRED" | "TEMPORARY_REWARD_HOLD";

export type RiskSignalInput = {
  type: string;
  weight: number;
};

export function calculateRisk(signals: RiskSignalInput[]): { score: number; level: RiskLevel } {
  const score = Math.min(
    100,
    signals.reduce((sum, signal) => sum + Math.max(0, signal.weight), 0),
  );
  const hasNonIpSignal = signals.some((signal) => signal.type !== "SHARED_IP");

  // A shared IP is common on mobile networks and may only cause observation.
  if (!hasNonIpSignal) return { score, level: score >= 20 ? "WATCH" : "NORMAL" };
  if (score >= 80) return { score, level: "TEMPORARY_REWARD_HOLD" };
  if (score >= 50) return { score, level: "REVIEW_REQUIRED" };
  if (score >= 20) return { score, level: "WATCH" };
  return { score, level: "NORMAL" };
}

export async function refreshRiskScore(userId: string, now = new Date()) {
  const signals = await prisma.fraudSignal.findMany({
    where: {
      userId,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { type: true, weight: true },
  });
  const result = calculateRisk(signals);
  return prisma.riskScore.upsert({
    where: { userId },
    create: {
      userId,
      ...result,
      reasons: signals,
      modelVersion: RISK_MODEL_VERSION,
      calculatedAt: now,
      holdUntil:
        result.level === "TEMPORARY_REWARD_HOLD"
          ? new Date(now.getTime() + 24 * 60 * 60 * 1_000)
          : null,
    },
    update: {
      ...result,
      reasons: signals,
      modelVersion: RISK_MODEL_VERSION,
      calculatedAt: now,
      holdUntil:
        result.level === "TEMPORARY_REWARD_HOLD"
          ? new Date(now.getTime() + 24 * 60 * 60 * 1_000)
          : null,
    },
  });
}

export function isRewardRiskSafe(level: RiskLevel): boolean {
  return level === "NORMAL" || level === "WATCH";
}
