import { z } from "zod";

export const referralListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ReferralListQuery = z.infer<typeof referralListQuerySchema>;
