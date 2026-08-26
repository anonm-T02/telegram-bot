import { z } from "zod";

const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/);

export const faqQuerySchema = z
  .object({ locale: z.string().trim().min(2).max(10).default("uz") })
  .strict();

export const supportChatBodySchema = z
  .object({
    message: z.string().trim().min(2).max(2_000),
    requestId: idempotencyKey,
    conversationId: z.string().cuid().optional(),
  })
  .strict();

export const supportTicketBodySchema = z
  .object({
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(3).max(4_000),
    category: z.enum(["ACCOUNT", "BALANCE", "CLICK", "REFERRAL", "REWARD", "OTHER"]),
    idempotencyKey,
  })
  .strict();

export const supportListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(20) })
  .strict();

export const supportTicketParamsSchema = z.object({ id: z.string().cuid() }).strict();
