export const APP_NAME = "NOVA ORG";
export const COIN_NAME = "NOVA Coin";
export const COIN_TICKER = "NVC";

export const HEALTH_STATUS = {
  OK: "ok",
  DEGRADED: "degraded",
  DOWN: "down",
} as const;

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];
