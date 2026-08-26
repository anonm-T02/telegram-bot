import { prisma } from "@nova-org/db";
import type { ActivityBody } from "@nova-org/validation";

const STALE_AFTER_MS = 60_000;
const MAX_ACTIVE_DELTA_SECONDS = 30;

export async function expireStaleActivitySessions(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const result = await prisma.activitySession.updateMany({
    where: { status: "OPEN", lastHeartbeatAt: { lt: staleBefore } },
    data: { status: "EXPIRED", state: "OFFLINE", endedAt: now, isRewardable: false },
  });
  return result.count;
}

export async function recordActivity(
  auth: { userId: string; sessionId: string },
  input: ActivityBody,
): Promise<void> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);

  await prisma.$transaction(async (tx) => {
    // Serialize activity-session assignment per user. The partial unique index remains
    // the database-level backstop, while this prevents an expected race becoming P2002.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${auth.userId}))`;
    await tx.activitySession.updateMany({
      where: { userId: auth.userId, status: "OPEN", lastHeartbeatAt: { lt: staleBefore } },
      data: { status: "EXPIRED", state: "OFFLINE", endedAt: now, isRewardable: false },
    });

    let session = await tx.activitySession.findUnique({
      where: { telegramSessionId: auth.sessionId },
    });
    if (session?.status === "OPEN" && !session.isRewardable) {
      const rewardable = await tx.activitySession.findFirst({
        where: { userId: auth.userId, status: "OPEN", isRewardable: true },
        select: { id: true },
      });
      if (!rewardable) {
        session = await tx.activitySession.update({
          where: { id: session.id },
          data: { isRewardable: true },
        });
      }
    }
    if (!session || session.status !== "OPEN") {
      const hasRewardable = await tx.activitySession.findFirst({
        where: { userId: auth.userId, status: "OPEN", isRewardable: true },
        select: { id: true },
      });
      if (session) {
        session = await tx.activitySession.update({
          where: { id: session.id },
          data: {
            state: input.state,
            status: "OPEN",
            isRewardable: !hasRewardable,
            lastHeartbeatAt: now,
            endedAt: null,
          },
        });
      } else {
        session = await tx.activitySession.create({
          data: {
            userId: auth.userId,
            telegramSessionId: auth.sessionId,
            state: input.state,
            isRewardable: !hasRewardable,
            lastHeartbeatAt: now,
          },
        });
      }
    }

    const previousHeartbeat = await tx.heartbeat.findFirst({
      where: { activitySessionId: session.id },
      orderBy: { clientSequence: "desc" },
      select: { clientSequence: true, isVisible: true },
    });
    const inserted = await tx.heartbeat.createMany({
      data: [
        {
          activitySessionId: session.id,
          state: input.state,
          isVisible: input.isVisible,
          clientSequence: input.clientSequence,
          receivedAt: now,
        },
      ],
      skipDuplicates: true,
    });
    if (
      inserted.count === 0 ||
      (previousHeartbeat && input.clientSequence <= previousHeartbeat.clientSequence)
    )
      return;

    const elapsedSeconds = Math.floor((now.getTime() - session.lastHeartbeatAt.getTime()) / 1_000);
    const activeIncrement =
      session.state === "ACTIVE" &&
      input.state === "ACTIVE" &&
      previousHeartbeat?.isVisible === true &&
      input.isVisible &&
      elapsedSeconds >= 0 &&
      elapsedSeconds <= STALE_AFTER_MS / 1_000
        ? Math.min(elapsedSeconds, MAX_ACTIVE_DELTA_SECONDS)
        : 0;

    await tx.activitySession.update({
      where: { id: session.id },
      data: {
        state: input.state,
        lastHeartbeatAt: now,
        activeSeconds: { increment: activeIncrement },
      },
    });
    await tx.telegramSession.update({ where: { id: auth.sessionId }, data: { lastUsedAt: now } });
  });
}
