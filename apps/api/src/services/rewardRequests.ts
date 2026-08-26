import { prisma, type Prisma } from "@nova-org/db";
import { refreshRiskScore } from "./risk.js";
import type { RewardProvider } from "./rewardProviders/index.js";

export const REWARD_COIN_COST = 100_000n;
export const REWARD_UNITS = 10;
export const DAILY_REWARD_LIMIT = 50;

export type RewardState =
  | "REQUESTED"
  | "RISK_CHECK"
  | "APPROVED"
  | "QUEUED"
  | "SENDING"
  | "PAID"
  | "REVIEW_REQUIRED"
  | "FAILED"
  | "REJECTED"
  | "REFUNDED";

const transitions: Record<RewardState, readonly RewardState[]> = {
  REQUESTED: ["RISK_CHECK"],
  RISK_CHECK: ["APPROVED", "REVIEW_REQUIRED", "REJECTED"],
  APPROVED: ["SENDING", "QUEUED", "REJECTED"],
  QUEUED: ["APPROVED", "SENDING", "REJECTED"],
  SENDING: ["PAID", "FAILED"],
  PAID: [],
  REVIEW_REQUIRED: ["APPROVED", "REJECTED"],
  FAILED: ["REFUNDED"],
  REJECTED: ["REFUNDED"],
  REFUNDED: [],
};

export function canTransitionReward(from: RewardState, to: RewardState): boolean {
  return transitions[from].includes(to);
}

export function rewardBudgetDecision(
  reservedUnits: number,
  units: number,
  paused: boolean,
  dailyLimit = DAILY_REWARD_LIMIT,
  paidUnits = 0,
) {
  const reserve = !paused && reservedUnits + paidUnits + units <= dailyLimit;
  return { reserve, queued: !reserve };
}

export function canBeginRewardDelivery(status: RewardState, payoutPaused: boolean): boolean {
  return status === "APPROVED" && !payoutPaused;
}

export class RewardRequestError extends Error {
  constructor(readonly code: "INSUFFICIENT_BALANCE" | "IDEMPOTENCY_CONFLICT" | "NOT_FOUND") {
    super(code);
  }
}

function utcDate(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const selection = {
  id: true,
  status: true,
  coinAmount: true,
  rewardUnits: true,
  providerType: true,
  requestDate: true,
  requestedAt: true,
  updatedAt: true,
  failureCode: true,
} as const;

export function serializeReward(request: {
  id: string;
  status: string;
  coinAmount: bigint;
  rewardUnits: number;
  providerType: string;
  requestDate: Date;
  requestedAt: Date;
  updatedAt: Date;
  failureCode: string | null;
}) {
  return { ...request, coinAmount: request.coinAmount.toString() };
}

async function paused(tx: Prisma.TransactionClient): Promise<boolean> {
  const setting = await tx.systemSetting.findUnique({ where: { key: "reward.payoutPaused" } });
  return setting?.value === true;
}

async function configuredDailyLimit(tx: Prisma.TransactionClient): Promise<number> {
  const setting = await tx.systemSetting.findUnique({ where: { key: "reward.dailyLimitUnits" } });
  return typeof setting?.value === "number" && Number.isInteger(setting.value)
    ? setting.value
    : DAILY_REWARD_LIMIT;
}

export async function createRewardRequest(
  userId: string,
  idempotencyKey: string,
  now = new Date(),
) {
  await refreshRiskScore(userId, now);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reward-user:${userId}`}, 0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reward-key:${idempotencyKey}`}, 0))`;
      const duplicate = await tx.rewardRequest.findUnique({
        where: { idempotencyKey },
        select: { userId: true, ...selection },
      });
      if (duplicate) {
        if (duplicate.userId !== userId) throw new RewardRequestError("IDEMPOTENCY_CONFLICT");
        return { request: serializeReward(duplicate), duplicate: true };
      }

      const requestDate = utcDate(now);
      const daily = await tx.rewardRequest.findUnique({
        where: { userId_requestDate: { userId, requestDate } },
        select: selection,
      });
      if (daily) return { request: serializeReward(daily), duplicate: true };

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < REWARD_COIN_COST)
        throw new RewardRequestError("INSUFFICIENT_BALANCE");
      const risk = await tx.riskScore.findUnique({ where: { userId }, select: { level: true } });
      const unsafe = risk?.level === "REVIEW_REQUIRED" || risk?.level === "TEMPORARY_REWARD_HOLD";
      const dailyLimit = await configuredDailyLimit(tx);

      const budget = await tx.rewardBudget.upsert({
        where: { budgetDate: requestDate },
        create: { budgetDate: requestDate, dailyLimit },
        update: {},
      });
      await tx.$executeRaw`SELECT id FROM "RewardBudget" WHERE id = ${budget.id} FOR UPDATE`;
      const currentBudget = await tx.rewardBudget.findUniqueOrThrow({ where: { id: budget.id } });
      const pool = await tx.rewardBudgetPool.findUniqueOrThrow({ where: { type: "USER_REWARD" } });
      await tx.$executeRaw`SELECT id FROM "RewardBudgetPool" WHERE id = ${pool.id} FOR UPDATE`;
      const currentPool = await tx.rewardBudgetPool.findUniqueOrThrow({ where: { id: pool.id } });
      const isPaused = await paused(tx);
      const poolExhausted =
        currentPool.reservedUnits + currentPool.spentUnits + REWARD_UNITS >
        currentPool.allocatedUnits;
      const decision = rewardBudgetDecision(
        currentBudget.reservedUnits,
        REWARD_UNITS,
        isPaused || poolExhausted,
        currentBudget.dailyLimit,
        currentBudget.paidUnits,
      );
      const status: RewardState = unsafe
        ? "REVIEW_REQUIRED"
        : decision.reserve
          ? "APPROVED"
          : "QUEUED";

      const created = await tx.rewardRequest.create({
        data: {
          userId,
          walletId: wallet.id,
          requestDate,
          idempotencyKey,
          status,
          coinAmount: REWARD_COIN_COST,
          rewardUnits: REWARD_UNITS,
          providerType: "TEST",
          riskCheckedAt: now,
          approvedAt: status === "APPROVED" ? now : null,
          queuedAt: status === "QUEUED" ? now : null,
          transitions: {
            create: [
              { fromStatus: null, toStatus: "REQUESTED", actorType: "USER", actorId: userId },
              { fromStatus: "REQUESTED", toStatus: "RISK_CHECK", actorType: "SYSTEM" },
              {
                fromStatus: "RISK_CHECK",
                toStatus: status,
                actorType: "SYSTEM",
                reason: unsafe
                  ? "RISK_GATE"
                  : isPaused
                    ? "PAYOUT_PAUSED"
                    : decision.queued
                      ? "DAILY_BUDGET_EXHAUSTED"
                      : "APPROVED",
              },
            ],
          },
        },
        select: selection,
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: REWARD_COIN_COST },
          lockedBalance: { increment: REWARD_COIN_COST },
        },
      });
      await tx.coinTransaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: "REWARD_LOCK",
          amount: -REWARD_COIN_COST,
          rewardRequestId: created.id,
          referenceType: "REWARD_REQUEST",
          referenceId: created.id,
        },
      });
      if (status === "APPROVED") {
        await tx.rewardBudget.update({
          where: { id: budget.id },
          data: { reservedUnits: { increment: REWARD_UNITS } },
        });
        await tx.rewardBudgetPool.update({
          where: { id: pool.id },
          data: { reservedUnits: { increment: REWARD_UNITS } },
        });
      }
      return { request: serializeReward(created), duplicate: false };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function listRewardRequests(userId: string, limit: number, cursor?: string) {
  const rows = await prisma.rewardRequest.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: selection,
  });
  return rows.map(serializeReward);
}

export async function getRewardRequest(userId: string, id: string) {
  const row = await prisma.rewardRequest.findFirst({ where: { id, userId }, select: selection });
  if (!row) throw new RewardRequestError("NOT_FOUND");
  return serializeReward(row);
}

export async function deliverReward(requestId: string, provider: RewardProvider, now = new Date()) {
  const sending = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reward-send:${requestId}`}, 0))`;
    // Serializes the final pause check with the admin emergency-pause mutation.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('reward-payout-control', 0))`;
    const request = await tx.rewardRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { user: { select: { telegramId: true } }, transactions: true },
    });
    if (request.status === "PAID" || request.status === "REFUNDED") return null;
    const isPaused = await paused(tx);
    if (!canBeginRewardDelivery(request.status, isPaused)) {
      if (request.status === "APPROVED" && isPaused) return null;
      throw new Error("INVALID_REWARD_TRANSITION");
    }
    const transaction = await tx.rewardTransaction.upsert({
      where: { rewardRequestId: requestId },
      create: {
        rewardRequestId: requestId,
        idempotencyKey: `reward:${requestId}`,
        providerType: provider.name,
        rewardUnits: request.rewardUnits,
        status: "SENDING",
        attemptCount: 1,
        sendingAt: now,
      },
      update: { status: "SENDING", attemptCount: { increment: 1 }, sendingAt: now },
    });
    await tx.rewardRequest.update({
      where: { id: requestId },
      data: {
        status: "SENDING",
        sendingAt: now,
        transitions: {
          create: { fromStatus: "APPROVED", toStatus: "SENDING", actorType: "SYSTEM" },
        },
      },
    });
    return { request, transaction };
  });
  if (!sending) return;
  let result;
  try {
    result = await provider.send({
      rewardRequestId: requestId,
      telegramId: sending.request.user.telegramId,
      stars: sending.request.rewardUnits,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Provider failed";
    await prisma.$transaction(async (tx) => {
      const current = await tx.rewardRequest.findUniqueOrThrow({ where: { id: requestId } });
      if (current.status !== "SENDING") return;
      await tx.rewardTransaction.update({
        where: { rewardRequestId: requestId },
        data: { status: "FAILED", lastErrorCode: "PROVIDER_ERROR", lastErrorMessage: message },
      });
      await tx.rewardRequest.update({
        where: { id: requestId },
        data: {
          status: "FAILED",
          failureCode: "PROVIDER_ERROR",
          failureReason: message,
          transitions: {
            create: {
              fromStatus: "SENDING",
              toStatus: "FAILED",
              actorType: "PROVIDER",
              actorId: provider.name,
              reason: message,
            },
          },
        },
      });
    });
    await refundRewardRequest(requestId, "PROVIDER_ERROR", now);
    return;
  }
  if (result.status === "PENDING") return;
  await prisma.$transaction(async (tx) => {
    const request = await tx.rewardRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status === "PAID") return;
    if (request.status !== "SENDING") throw new Error("INVALID_REWARD_TRANSITION");
    await tx.rewardTransaction.update({
      where: { rewardRequestId: requestId },
      data: { status: "SUCCEEDED", providerReference: result.providerReference, sentAt: now },
    });
    await tx.rewardRequest.update({
      where: { id: requestId },
      data: {
        status: "PAID",
        completedAt: now,
        transitions: {
          create: {
            fromStatus: "SENDING",
            toStatus: "PAID",
            actorType: "PROVIDER",
            actorId: provider.name,
          },
        },
      },
    });
    await tx.wallet.update({
      where: { id: request.walletId },
      data: {
        lockedBalance: { decrement: request.coinAmount },
        totalSpent: { increment: request.coinAmount },
      },
    });
    await tx.coinTransaction.create({
      data: {
        userId: request.userId,
        walletId: request.walletId,
        type: "REWARD_REDEEM",
        amount: 0n,
        rewardRequestId: request.id,
        referenceType: "REWARD_REQUEST",
        referenceId: request.id,
      },
    });
    await tx.rewardBudget.update({
      where: { budgetDate: request.requestDate },
      data: {
        reservedUnits: { decrement: request.rewardUnits },
        paidUnits: { increment: request.rewardUnits },
      },
    });
    await tx.rewardBudgetPool.update({
      where: { type: "USER_REWARD" },
      data: {
        reservedUnits: { decrement: request.rewardUnits },
        spentUnits: { increment: request.rewardUnits },
      },
    });
  });
}

export async function refundRewardRequest(requestId: string, reason: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`reward-send:${requestId}`}, 0))`;
    const request = await tx.rewardRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status === "REFUNDED") return;
    if (request.status !== "FAILED" && request.status !== "REJECTED")
      throw new Error("INVALID_REWARD_TRANSITION");
    await tx.wallet.update({
      where: { id: request.walletId },
      data: {
        balance: { increment: request.coinAmount },
        lockedBalance: { decrement: request.coinAmount },
      },
    });
    await tx.coinTransaction.create({
      data: {
        userId: request.userId,
        walletId: request.walletId,
        type: "REWARD_REFUND",
        amount: request.coinAmount,
        rewardRequestId: request.id,
        referenceType: "REWARD_REQUEST",
        referenceId: request.id,
        metadata: { reason },
      },
    });
    await tx.rewardRequest.update({
      where: { id: request.id },
      data: {
        status: "REFUNDED",
        completedAt: now,
        transitions: {
          create: { fromStatus: request.status, toStatus: "REFUNDED", actorType: "SYSTEM", reason },
        },
      },
    });
    if (request.status === "FAILED") {
      await tx.rewardBudget.update({
        where: { budgetDate: request.requestDate },
        data: { reservedUnits: { decrement: request.rewardUnits } },
      });
      await tx.rewardBudgetPool.update({
        where: { type: "USER_REWARD" },
        data: { reservedUnits: { decrement: request.rewardUnits } },
      });
    }
  });
}
