import { z } from "zod";

export const rewardRequestSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9:_-]+$/),
  })
  .strict();

export const rewardListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().cuid().optional(),
});

export const rewardIdParamsSchema = z.object({ id: z.string().cuid() }).strict();

export type RewardRequestInput = z.infer<typeof rewardRequestSchema>;
