export type ActivityState = "ONLINE" | "ACTIVE" | "IDLE" | "BACKGROUND";

export interface TelegramAuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresAt: string;
}

export interface ActivityPayload {
  state: ActivityState;
  clientTimestamp: string;
  clientSequence: number;
  isVisible: boolean;
}

export interface ClickStatusResponse {
  dailyAccepted: number;
  dailyRemaining: number;
  dailyLimit: number;
  nextAllowedAt: string | null;
  canClick: boolean;
  balanceMicrocoins: string;
  sessionEligible: boolean;
  sessionRejection?: "SESSION_INACTIVE" | "SESSION_NOT_REWARDABLE";
}

export interface ClickResponse {
  requestId: string;
  accepted: true;
  duplicate: boolean;
  rewardMicrocoins: string;
  acceptedAt: string;
  dailyAccepted: number;
  dailyLimit: number;
  nextAllowedAt: string;
  balanceMicrocoins: string;
}

export interface ReferralStats {
  invitedCount: number;
  pendingCount: number;
  availableCount: number;
  queuedCount: number;
  totalPending: string;
  totalAvailable: string;
  qualityReleasedToday: number;
}

export type ReferralStatus =
  "PENDING" | "ACTIVE" | "QUALITY_QUEUED" | "QUALIFIED" | "REJECTED" | "REWARDED";
export type ReferralMilestoneType =
  | "REFERRER_REGISTER"
  | "REFERRER_ACTIVE_3_DAYS"
  | "REFERRER_QUALITY_7_DAYS"
  | "REFERRED_USER_QUALITY";
export type ReferralMilestoneStatus = "PENDING" | "ELIGIBLE" | "QUEUED" | "RELEASED" | "REJECTED";

export interface ReferralMilestone {
  type: ReferralMilestoneType;
  status: ReferralMilestoneStatus;
  amountMicrocoins: string;
  eligibleAt: string | null;
  releasedAt: string | null;
}

export interface ReferralItem {
  id: string;
  status: ReferralStatus;
  createdAt: string;
  metrics: {
    activeDays: number;
    activeSeconds: number;
    validClicks: number;
  };
  milestones: ReferralMilestone[];
}

export interface ReferralsResponse {
  referralCode: string;
  referralLink: string;
  stats: ReferralStats;
  referrals: ReferralItem[];
}

export type RewardStatus =
  | "REQUESTED"
  | "RISK_CHECK"
  | "APPROVED"
  | "QUEUED"
  | "SENDING"
  | "PAID"
  | "REVIEW_REQUIRED"
  | "FAILED"
  | "REJECTED"
  | "REFUNDED";

export interface RewardItem {
  id: string;
  status: RewardStatus;
  coinAmount: string;
  rewardUnits: number;
  providerType: string;
  requestedAt: string;
  updatedAt: string;
  failureCode: string | null;
}

export interface RewardsResponse {
  wallet: { availableMicrocoins: string; lockedMicrocoins: string };
  rewards: RewardItem[];
}

export interface RewardRequestResponse {
  request: RewardItem;
  duplicate: boolean;
}

export interface FaqArticle {
  slug: string;
  question: string;
  answer: string;
  keywords: string[];
}
export interface SupportChatResponse {
  conversationId: string;
  response: string;
  source: string;
  duplicate: boolean;
}
export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error?: string;
  nextAllowedAt?: string;
  dailyAccepted?: number;
  dailyLimit?: number;
  balanceMicrocoins?: string;
}

export class SessionUnauthorizedError extends Error {}

export class SessionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: ApiErrorBody,
    readonly definitive: boolean,
  ) {
    super(message);
  }
}

const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `API returned ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function authenticateTelegram(initData: string): Promise<TelegramAuthResponse> {
  return readJson<TelegramAuthResponse>(
    await fetch(`${API_URL}/auth/telegram`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
    }),
  );
}

export async function refreshTelegramSession(refreshToken: string): Promise<TelegramAuthResponse> {
  return readJson<TelegramAuthResponse>(
    await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }),
  );
}

export async function getPublicFaq(): Promise<{ articles: FaqArticle[] }> {
  return readJson(await fetch(`${API_URL}/support/faq?locale=uz`));
}

export class SessionApiClient {
  private refreshInFlight: Promise<void> | undefined;

  constructor(
    private accessToken: string,
    private refreshToken: string,
  ) {}

  async heartbeat(payload: ActivityPayload): Promise<void> {
    await this.request("/activity/heartbeat", { method: "POST", payload });
  }

  async reportState(payload: ActivityPayload): Promise<void> {
    await this.request("/activity/state", { method: "POST", payload });
  }

  async getClickStatus(): Promise<ClickStatusResponse> {
    return this.request<ClickStatusResponse>("/click/status", { method: "GET" });
  }

  async click(requestId: string): Promise<ClickResponse> {
    return this.request<ClickResponse>("/click", {
      method: "POST",
      payload: { requestId },
    });
  }

  async getReferrals(): Promise<ReferralsResponse> {
    return this.request<ReferralsResponse>("/referrals", { method: "GET" });
  }

  async getRewards(): Promise<RewardsResponse> {
    return this.request<RewardsResponse>("/rewards", { method: "GET" });
  }

  async requestReward(idempotencyKey: string): Promise<RewardRequestResponse> {
    return this.request<RewardRequestResponse>("/rewards/request", {
      method: "POST",
      payload: { idempotencyKey },
    });
  }

  async getFaq(): Promise<{ articles: FaqArticle[] }> {
    return this.request("/support/faq?locale=uz", { method: "GET" });
  }

  async supportChat(
    message: string,
    requestId: string,
    conversationId?: string,
  ): Promise<SupportChatResponse> {
    return this.request("/support/chat", {
      method: "POST",
      payload: { message, requestId, ...(conversationId ? { conversationId } : {}) },
    });
  }

  async getSupportTickets(): Promise<{ tickets: SupportTicket[] }> {
    return this.request("/support/tickets", { method: "GET" });
  }

  async createSupportTicket(subject: string, message: string, idempotencyKey: string) {
    return this.request<{ ticket: SupportTicket; duplicate: boolean }>("/support/tickets", {
      method: "POST",
      payload: { subject, message, category: "OTHER", idempotencyKey },
    });
  }

  private async request<T = void>(
    path: string,
    options: { method: "GET" | "POST"; payload?: object },
    retry = true,
  ): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(options.payload ? { "content-type": "application/json" } : {}),
      },
      body: options.payload ? JSON.stringify(options.payload) : undefined,
    });
    if (response.status === 401 && retry) {
      try {
        if (!this.refreshInFlight) {
          this.refreshInFlight = refreshTelegramSession(this.refreshToken)
            .then((rotated) => {
              this.accessToken = rotated.accessToken;
              this.refreshToken = rotated.refreshToken;
            })
            .finally(() => {
              this.refreshInFlight = undefined;
            });
        }
        await this.refreshInFlight;
        return this.request<T>(path, options, false);
      } catch {
        throw new SessionUnauthorizedError("Telegram session expired");
      }
    }
    if (response.status === 401) throw new SessionUnauthorizedError("Telegram session expired");
    if (!response.ok) {
      let validJson = false;
      const body = (await response
        .json()
        .then((value: unknown) => {
          validJson = typeof value === "object" && value !== null;
          return validJson ? value : {};
        })
        .catch(() => ({}))) as ApiErrorBody;
      const definitive =
        response.status >= 400 &&
        response.status < 500 &&
        validJson &&
        typeof body.error === "string";
      throw new SessionRequestError(
        body.error ?? `API returned ${response.status}`,
        response.status,
        body,
        definitive,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
