import { executeSupportTool, type SupportToolName } from "./supportTools.js";
import { prisma } from "@nova-org/db";

export interface SupportAiProvider {
  readonly name: string;
  respond(input: { userId: string; message: string; requestId: string }): Promise<{
    text: string;
    toolName?: SupportToolName;
    toolResult?: unknown;
  }>;
}

export function selectDeterministicTool(message: string): SupportToolName | null {
  const text = message.toLocaleLowerCase("uz");
  if (/\b(balans|balance|coinim)\b/.test(text)) return "get_my_balance";
  if (/\b(click|tap|bosish)\b/.test(text)) return "get_my_click_stats";
  if (/\b(referral|taklif)\b/.test(text)) return "get_my_referral_status";
  if (/\b(reward|stars|mukofot)\b/.test(text)) return "get_my_reward_status";
  if (/\b(faq|savollar)\b/.test(text)) return "list_public_faq";
  return null;
}

export class DeterministicSupportProvider implements SupportAiProvider {
  readonly name = "DETERMINISTIC";

  async respond(input: { userId: string; message: string; requestId: string }) {
    const toolName = selectDeterministicTool(input.message);
    if (!toolName) {
      return {
        text: "Bu savol uchun tayyor javob topilmadi. Support ticket yaratsangiz, operator ko‘rib chiqadi.",
      };
    }
    const toolResult = await executeSupportTool(input.userId, toolName);
    return {
      text: "Ma’lumot faqat sizning autentifikatsiyalangan hisobingizdan olindi.",
      toolName,
      toolResult,
    };
  }
}

type WorkersAiResponse = { success?: boolean; result?: { response?: string } };

export const deterministicSupportProvider = new DeterministicSupportProvider();

export class CloudflareWorkersAiProvider implements SupportAiProvider {
  readonly name = "CLOUDFLARE_WORKERS_AI";

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly model: string,
    private readonly dailyBonus: number,
  ) {}

  async respond(input: { userId: string; message: string; requestId: string }) {
    if (selectDeterministicTool(input.message)) return deterministicSupportProvider.respond(input);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const used = await prisma.aiMessage.count({
      where: {
        provider: this.name,
        createdAt: { gte: startOfDay },
        conversation: { userId: input.userId },
      },
    });
    if (used >= this.dailyBonus) {
      return {
        text: `Bugungi ${this.dailyBonus} ta bepul NOVA AI javobingiz ishlatildi. Ertaga bonus yangilanadi yoki support ticket yarating.`,
        toolResult: { bonusLimit: this.dailyBonus, bonusRemaining: 0 },
      };
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/ai/run/${this.model}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are NOVA AI, a concise Uzbek-language assistant. Never claim to change balances, rewards, risk, bans, roles, or configuration. Never request secrets. For account-specific actions, direct the user to official NOVA screens or a support ticket.",
            },
            { role: "user", content: input.message },
          ],
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`Cloudflare Workers AI failed with ${response.status}`);
    const payload = (await response.json()) as WorkersAiResponse;
    const text = payload.result?.response?.trim();
    if (!payload.success || !text)
      throw new Error("Cloudflare Workers AI returned an invalid response");
    return {
      text,
      toolResult: {
        bonusLimit: this.dailyBonus,
        bonusRemaining: Math.max(0, this.dailyBonus - used - 1),
      },
    };
  }
}

export function createSupportAiProvider(config: {
  accountId?: string;
  apiToken?: string;
  model: string;
  dailyBonus: number;
}): SupportAiProvider {
  return config.accountId && config.apiToken
    ? new CloudflareWorkersAiProvider(
        config.accountId,
        config.apiToken,
        config.model,
        config.dailyBonus,
      )
    : deterministicSupportProvider;
}
