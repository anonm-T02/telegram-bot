import type {
  DailyRewardResponse,
  EnsureUserResponse,
  ReferralStatsResponse,
  WalletResponse,
} from "@nova-org/shared";
import { env } from "./env.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function callInternalApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.INTERNAL_API_SECRET,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(response.status, `Internal API ${path} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

interface EnsureUserInput {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  referralCodeUsed?: string;
}

export function ensureUser(input: EnsureUserInput): Promise<EnsureUserResponse> {
  return callInternalApi<EnsureUserResponse>("/internal/users/ensure", {
    method: "POST",
    body: JSON.stringify({ ...input, telegramId: String(input.telegramId) }),
  });
}

export function getWallet(telegramId: number): Promise<WalletResponse> {
  return callInternalApi<WalletResponse>(`/internal/wallet/${telegramId}`);
}

export function claimDailyReward(telegramId: number): Promise<DailyRewardResponse> {
  return callInternalApi<DailyRewardResponse>("/internal/rewards/daily", {
    method: "POST",
    body: JSON.stringify({ telegramId: String(telegramId) }),
  });
}

export function getReferralStats(telegramId: number): Promise<ReferralStatsResponse> {
  return callInternalApi<ReferralStatsResponse>(`/internal/referral/${telegramId}`);
}
