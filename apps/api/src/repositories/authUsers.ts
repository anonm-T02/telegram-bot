import type { TelegramWebAppUser } from "@nova-org/validation";
import { prisma } from "@nova-org/db";
import { ensureUser } from "../services/users.js";
import type { AuthUserRepository } from "../services/telegramAuth.js";

function referralCodeFromStartParam(startParam?: string): string | undefined {
  if (!startParam?.startsWith("ref_")) return undefined;
  const code = startParam.slice(4).trim();
  return /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code.toUpperCase() : undefined;
}

export const authUserRepository: AuthUserRepository = {
  async upsertTelegramUser(user: TelegramWebAppUser, startParam?: string) {
    const result = await ensureUser({
      telegramId: BigInt(user.id),
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      languageCode: user.language_code,
      referralCodeUsed: referralCodeFromStartParam(startParam),
    });
    const persistedUser = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      select: { status: true },
    });
    return { userId: result.userId, status: persistedUser.status };
  },
  async saveSession(input) {
    await prisma.telegramSession.create({ data: input });
  },
  async findRefreshSession(sessionId) {
    return prisma.telegramSession
      .findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          userId: true,
          refreshTokenHash: true,
          expiresAt: true,
          revokedAt: true,
          user: { select: { telegramId: true, status: true } },
        },
      })
      .then((session) =>
        session
          ? { ...session, telegramId: session.user.telegramId, status: session.user.status }
          : null,
      );
  },
  async rotateSession(input) {
    const result = await prisma.telegramSession.updateMany({
      where: {
        id: input.sessionId,
        refreshTokenHash: input.previousRefreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        tokenHash: input.tokenHash,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        lastUsedAt: new Date(),
      },
    });
    return result.count === 1;
  },
  async revokeSession(sessionId) {
    await prisma.telegramSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
