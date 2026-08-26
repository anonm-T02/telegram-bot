export const APP_NAME = "NOVA ORG";
export const COIN_NAME = "NOVA Coin";
export const COIN_TICKER = "NVC";

export const HEALTH_STATUS = {
  OK: "ok",
  DEGRADED: "degraded",
  DOWN: "down",
} as const;

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

/**
 * Default reward amounts (in NVC). Phase 2 keeps these as constants;
 * they move to an admin-editable `system_settings` table in a later phase
 * (see NOVA_ORG_AGENT_PLAN.md section 14/21).
 */
export const DEFAULT_DAILY_REWARD_AMOUNT = 50;
export const DEFAULT_REFERRAL_REWARD_AMOUNT = 500;

export const REFERRAL_DEEP_LINK_PREFIX = "ref_";
