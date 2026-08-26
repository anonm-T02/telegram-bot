import { z } from "zod";

export const accountDeletionRequestBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type AccountDeletionRequestBody = z.infer<typeof accountDeletionRequestBodySchema>;
