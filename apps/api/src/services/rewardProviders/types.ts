export type RewardProviderResult =
  { status: "SENT"; providerReference: string } | { status: "PENDING"; providerReference?: string };

export interface RewardProvider {
  readonly name: "TEST" | "MANUAL";
  send(input: {
    rewardRequestId: string;
    telegramId: bigint;
    stars: number;
  }): Promise<RewardProviderResult>;
}
