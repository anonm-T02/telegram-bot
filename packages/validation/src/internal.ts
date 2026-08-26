import { z } from "zod";

/**
 * Validation schemas for the bot <-> API internal endpoints
 * (see NOVA_ORG_AGENT_PLAN.md sections 13, 29 — never trust client input,
 * validate everything with Zod).
 */

export const telegramIdParamSchema = z.object({
  telegramId: z.string().regex(/^\d+$/, "telegramId must be a numeric string"),
});

export const ensureUserBodySchema = z.object({
  telegramId: z.string().regex(/^\d+$/, "telegramId must be a numeric string"),
  username: z.string().trim().min(1).max(64).optional(),
  firstName: z.string().trim().min(1).max(128).optional(),
  lastName: z.string().trim().min(1).max(128).optional(),
  languageCode: z.string().trim().min(1).max(16).optional(),
  referralCodeUsed: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .optional()
    .transform((value) => value?.toUpperCase()),
});

export type EnsureUserBody = z.infer<typeof ensureUserBodySchema>;
export type TelegramIdParam = z.infer<typeof telegramIdParamSchema>;
