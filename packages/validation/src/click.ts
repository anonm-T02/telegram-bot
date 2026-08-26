import { z } from "zod";

export const clickBodySchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict();

export type ClickBody = z.infer<typeof clickBodySchema>;
