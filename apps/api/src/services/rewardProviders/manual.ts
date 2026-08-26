import type { RewardProvider, RewardProviderResult } from "./types.js";

export class ManualRewardProvider implements RewardProvider {
  readonly name = "MANUAL" as const;

  async send(input: {
    rewardRequestId: string;
    telegramId: bigint;
    stars: number;
  }): Promise<RewardProviderResult> {
    void input;
    return { status: "PENDING" };
  }
}
