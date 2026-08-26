import { prisma } from "@nova-org/db";
import { supportTicketBodySchema } from "@nova-org/validation";
import { CLICK_DAILY_LIMIT, utcDate } from "./click.js";
import { createSupportTicket } from "./supportTickets.js";

export const SUPPORT_TOOL_NAMES = [
  "get_my_balance",
  "get_my_click_stats",
  "get_my_referral_status",
  "get_my_reward_status",
  "create_support_ticket",
  "list_public_faq",
] as const;

export type SupportToolName = (typeof SUPPORT_TOOL_NAMES)[number];

export function isAllowedSupportTool(name: string): name is SupportToolName {
  return (SUPPORT_TOOL_NAMES as readonly string[]).includes(name);
}

export async function executeSupportTool(
  authenticatedUserId: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  if (!isAllowedSupportTool(name)) throw new Error("SUPPORT_TOOL_NOT_ALLOWED");
  // The authenticated user id is server-injected. Tool arguments deliberately
  // contain no userId field and can never select another account.
  if (name === "get_my_balance") {
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId: authenticatedUserId },
    });
    return {
      availableMicrocoins: wallet.balance.toString(),
      lockedMicrocoins: wallet.lockedBalance.toString(),
      pendingMicrocoins: wallet.pendingBalance.toString(),
    };
  }
  if (name === "get_my_click_stats") {
    const counter = await prisma.clickDailyCounter.findUnique({
      where: { userId_clickDate: { userId: authenticatedUserId, clickDate: utcDate(new Date()) } },
    });
    return {
      acceptedToday: counter?.acceptedCount ?? 0,
      remainingToday: Math.max(0, CLICK_DAILY_LIMIT - (counter?.acceptedCount ?? 0)),
    };
  }
  if (name === "get_my_referral_status") {
    const [total, queued, rewarded] = await Promise.all([
      prisma.referral.count({ where: { referrerUserId: authenticatedUserId } }),
      prisma.referral.count({
        where: { referrerUserId: authenticatedUserId, status: "QUALITY_QUEUED" },
      }),
      prisma.referral.count({ where: { referrerUserId: authenticatedUserId, status: "REWARDED" } }),
    ]);
    return { total, queued, rewarded };
  }
  if (name === "get_my_reward_status") {
    const request = await prisma.rewardRequest.findFirst({
      where: { userId: authenticatedUserId },
      orderBy: { requestedAt: "desc" },
      select: { id: true, status: true, rewardUnits: true, requestedAt: true },
    });
    return request ?? { status: "NONE" };
  }
  if (name === "list_public_faq") {
    return prisma.faqArticle.findMany({
      where: { isPublished: true, locale: typeof args.locale === "string" ? args.locale : "uz" },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      select: { slug: true, question: true, answer: true },
    });
  }
  const ticket = supportTicketBodySchema.safeParse({
    subject: args.subject,
    message: args.message,
    category: "OTHER",
    idempotencyKey: args.idempotencyKey,
  });
  if (!ticket.success) throw new Error("INVALID_SUPPORT_TOOL_ARGUMENTS");
  return createSupportTicket(authenticatedUserId, ticket.data);
}
