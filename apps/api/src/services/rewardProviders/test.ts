import type { RewardProvider, RewardProviderResult } from "./types.js";

export class TestRewardProvider implements RewardProvider {
  readonly name = "TEST" as const;

  async send(input: {
    rewardRequestId: string;
    telegramId: bigint;
    stars: number;
  }): Promise<RewardProviderResult> {
    return { status: "SENT", providerReference: `test:${input.rewardRequestId}` };
  }
}
