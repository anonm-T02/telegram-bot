import { z } from "zod";

export const telegramAuthBodySchema = z.object({
  initData: z.string().min(1).max(16_384),
});

export const refreshAuthBodySchema = z.object({
  refreshToken: z.string().min(32).max(4096),
});

export const logoutAuthBodySchema = refreshAuthBodySchema;

export const telegramWebAppUserSchema = z.object({
  id: z.number().int().positive().safe(),
  is_bot: z.literal(false).optional(),
  first_name: z.string().min(1).max(128),
  last_name: z.string().max(128).optional(),
  username: z.string().min(1).max(64).optional(),
  language_code: z.string().min(1).max(16).optional(),
  is_premium: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
  photo_url: z.string().url().max(2_048).optional(),
});

export type TelegramAuthBody = z.infer<typeof telegramAuthBodySchema>;
export type RefreshAuthBody = z.infer<typeof refreshAuthBodySchema>;
export type TelegramWebAppUser = z.infer<typeof telegramWebAppUserSchema>;
