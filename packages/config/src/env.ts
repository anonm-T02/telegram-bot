import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_BOT_USERNAME: z.string().min(1, "TELEGRAM_BOT_USERNAME is required"),

  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  ADMIN_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

  WORK_SIGNING_SECRET: z.string().min(16, "WORK_SIGNING_SECRET must be at least 16 characters"),

  // Shared secret used by the bot process to call the API's internal
  // (non-public) endpoints — e.g. wallet/reward reads and mutations that
  // only the bot is allowed to trigger. Never exposed to the Mini App.
  INTERNAL_API_SECRET: z.string().min(16, "INTERNAL_API_SECRET must be at least 16 characters"),

  DAILY_REWARD_AMOUNT: z.coerce.number().int().positive().default(50),
  REFERRAL_REWARD_AMOUNT: z.coerce.number().int().positive().default(500),

  ADMIN_TELEGRAM_IDS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),

  API_PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_API_PORT: z.coerce.number().int().positive().default(4001),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/**
 * Validates and parses process.env. Throws a descriptive error if any
 * required variable is missing or malformed, so misconfiguration fails
 * fast at startup rather than causing silent bugs later.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

/** Resets the cached env. Intended for tests only. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
