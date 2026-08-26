import { executeSupportTool, type SupportToolName } from "./supportTools.js";

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

// Default provider performs no network requests and needs no provider secret.
export const supportAiProvider: SupportAiProvider = new DeterministicSupportProvider();
