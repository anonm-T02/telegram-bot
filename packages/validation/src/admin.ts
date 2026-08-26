import { z } from "zod";

export const adminLoginChallengeBodySchema = z
  .object({ codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();

export const adminLoginExchangeBodySchema = z
  .object({
    challengeId: z.string().uuid(),
    codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  })
  .strict();

export const adminListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().cuid().optional(),
  })
  .strict();

export const adminUserListQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["ACTIVE", "SUSPENDED", "BLOCKED", "DELETED"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const adminUserParamsSchema = z.object({ id: z.string().cuid() }).strict();

export const adminUserStatusBodySchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED", "BLOCKED"]),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9:_-]+$/),
  })
  .strict();

export const adminSettingParamsSchema = z
  .object({ key: z.enum(["reward.payoutPaused", "reward.dailyLimitUnits"]) })
  .strict();

export const adminSettingBodySchema = z
  .object({
    value: z.union([z.boolean(), z.number().int().nonnegative()]),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9:_-]+$/),
  })
  .strict();

export const adminRewardListQuerySchema = adminListQuerySchema.extend({
  status: z
    .enum([
      "REQUESTED",
      "RISK_CHECK",
      "APPROVED",
      "QUEUED",
      "SENDING",
      "PAID",
      "REVIEW_REQUIRED",
      "FAILED",
      "REJECTED",
      "REFUNDED",
    ])
    .optional(),
});

export const adminFraudListQuerySchema = adminListQuerySchema.extend({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]).optional(),
});
