import { Prisma, prisma } from "@nova-org/db";
import { generateReferralCode } from "@nova-org/shared";
import type { EnsureUserResponse } from "@nova-org/shared";
import { env } from "../env.js";

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

  const referrer = input.referralCodeUsed
    ? await prisma.user.findUnique({ where: { referralCode: input.referralCodeUsed } })
    : null;

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

        // Referral reward is credited to the referrer, not the new user,
        // once their referred friend joins (see NOVA_ORG_AGENT_PLAN.md
        // section 7 — coin only changes via the backend ledger).
        if (referrer) {
          await tx.referral.create({
            data: {
              referrerUserId: referrer.id,
              referredUserId: user.id,
              status: "REWARDED",
              reward: env.REFERRAL_REWARD_AMOUNT,
            },
          });

          const referrerWallet = await tx.wallet.update({
            where: { userId: referrer.id },
            data: {
              balance: { increment: env.REFERRAL_REWARD_AMOUNT },
              totalEarned: { increment: env.REFERRAL_REWARD_AMOUNT },
            },
          });

          await tx.coinTransaction.create({
            data: {
              userId: referrer.id,
              walletId: referrerWallet.id,
              type: "REFERRAL_REWARD",
              amount: env.REFERRAL_REWARD_AMOUNT,
              referenceType: "referral",
              referenceId: user.id,
            },
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
