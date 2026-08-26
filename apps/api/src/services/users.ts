import { Prisma, prisma } from "@nova-org/db";
import { generateReferralCode } from "@nova-org/shared";
import type { EnsureUserResponse } from "@nova-org/shared";

interface EnsureUserInput {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  referralCodeUsed?: string;
}

const MAX_REFERRAL_CODE_ATTEMPTS = 5;

function isUniqueConstraintError(error: unknown, target: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    (error.meta?.target as string[]).includes(target)
  );
}

/**
 * Ensures a User + Wallet row exists for a given Telegram user, linking a
 * referral on first creation. Idempotent and safe under concurrent calls:
 * - a fresh referral code is regenerated and retried on collision;
 * - a duplicate telegramId (race between two concurrent `/start`s) falls
 *   back to returning the row created by the other request instead of
 *   erroring.
 *
 * Only ever called by the Telegram bot via the internal API — never by
 * the Mini App/browser (see NOVA_ORG_AGENT_PLAN.md section 13).
 */
export async function ensureUser(input: EnsureUserInput): Promise<EnsureUserResponse> {
  const existing = await prisma.user.findUnique({ where: { telegramId: input.telegramId } });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        languageCode: input.languageCode,
      },
    });
    return { userId: updated.id, referralCode: updated.referralCode, isNewUser: false };
  }

  let referrer = null;
  if (input.referralCodeUsed) {
    const canonicalLink = await prisma.referralLink.findUnique({
      where: { code: input.referralCodeUsed },
      include: { user: true },
    });
    // Fall back to User.referralCode only during the rollout. A known but
    // revoked canonical link must never be revived by that fallback.
    referrer = canonicalLink
      ? canonicalLink.isActive && canonicalLink.revokedAt === null
        ? canonicalLink.user
        : null
      : await prisma.user.findUnique({ where: { referralCode: input.referralCodeUsed } });
  }

  for (let attempt = 0; attempt < MAX_REFERRAL_CODE_ATTEMPTS; attempt++) {
    const referralCode = generateReferralCode();

    try {
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            telegramId: input.telegramId,
            username: input.username,
            firstName: input.firstName,
            lastName: input.lastName,
            languageCode: input.languageCode,
            referralCode,
            referredById: referrer?.id,
          },
        });

        const wallet = await tx.wallet.create({ data: { userId: user.id } });
        await tx.referralLink.create({ data: { userId: user.id, code: referralCode } });

        // Registration creates pending entitlement only. Available balance is
        // released later by the server-side quality evaluator.
        if (referrer) {
          const referral = await tx.referral.create({
            data: {
              referrerUserId: referrer.id,
              referredUserId: user.id,
              status: "PENDING",
              reward: 0n,
            },
          });
          await tx.referralMilestone.createMany({
            data: [
              {
                referralId: referral.id,
                beneficiaryId: referrer.id,
                type: "REFERRER_REGISTER",
                status: "ELIGIBLE",
                amount: 500n,
                idempotencyKey: `referral:${referral.id}:register`,
                eligibleAt: new Date(),
              },
              {
                referralId: referral.id,
                beneficiaryId: referrer.id,
                type: "REFERRER_ACTIVE_3_DAYS",
                amount: 500n,
                idempotencyKey: `referral:${referral.id}:active-3-days`,
              },
              {
                referralId: referral.id,
                beneficiaryId: referrer.id,
                type: "REFERRER_QUALITY_7_DAYS",
                amount: 1_000n,
                idempotencyKey: `referral:${referral.id}:quality-7-days`,
              },
              {
                referralId: referral.id,
                beneficiaryId: user.id,
                type: "REFERRED_USER_QUALITY",
                amount: 500n,
                idempotencyKey: `referral:${referral.id}:referred-user-quality`,
              },
            ],
          });
          await tx.wallet.update({
            where: { userId: referrer.id },
            data: { pendingBalance: { increment: 500n } },
          });
        }

        return { user, wallet };
      });

      return { userId: created.user.id, referralCode: created.user.referralCode, isNewUser: true };
    } catch (error) {
      if (isUniqueConstraintError(error, "referralCode")) {
        continue; // collision on the generated code — try a new one
      }
      if (isUniqueConstraintError(error, "telegramId")) {
        // Lost the race to a concurrent request for the same Telegram user.
        const raceWinner = await prisma.user.findUniqueOrThrow({
          where: { telegramId: input.telegramId },
        });
        return { userId: raceWinner.id, referralCode: raceWinner.referralCode, isNewUser: false };
      }
      throw error;
    }
  }

  throw new Error("Failed to generate a unique referral code after multiple attempts");
}
