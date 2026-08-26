import { z } from "zod";

export const activityStateSchema = z.enum(["ONLINE", "ACTIVE", "IDLE", "BACKGROUND"]);

export const activityBodySchema = z.object({
  state: activityStateSchema,
  clientTimestamp: z.string().datetime(),
  clientSequence: z.number().int().nonnegative(),
  isVisible: z.boolean(),
});

export type ActivityBody = z.infer<typeof activityBodySchema>;
