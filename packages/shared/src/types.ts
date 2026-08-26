/**
 * Minimal shared type placeholders for Phase 1 (Foundation).
 * Full domain types (User, Wallet, ContributionSession, WorkUnit, etc.)
 * will be introduced in Phase 2/3 alongside the database schema.
 */
export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}

/**
 * Bot <-> API internal contract for Phase 2 (Coin Economy, bot-only
 * surface). These endpoints are never called from the Mini App/browser —
 * only from the trusted Telegram bot process, using a shared secret.
 */
export interface EnsureUserRequest {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  referralCodeUsed?: string;
}

export interface EnsureUserResponse {
  userId: string;
  referralCode: string;
  isNewUser: boolean;
}

export interface WalletResponse {
  balance: string;
  totalEarned: string;
  totalSpent: string;
}

export interface DailyRewardResponse {
  claimed: boolean;
  alreadyClaimedToday: boolean;
  amount: string;
  balance: string;
}

export interface ReferralStatsResponse {
  referralCode: string;
  invitedCount: number;
  totalEarned: string;
}
