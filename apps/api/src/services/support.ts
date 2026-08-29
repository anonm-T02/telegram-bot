import { Prisma, prisma } from "@nova-org/db";
import { deterministicSupportProvider, type SupportAiProvider } from "./supportAi.js";
import { SupportError } from "./supportTickets.js";

export type PublicFaq = { slug: string; question: string; answer: string; keywords: string[] };

function words(value: string): string[] {
  return value
    .toLocaleLowerCase("uz")
    .replace(/[^a-z0-9ʻʼ'а-яё]+/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

export function findFaqAnswer(message: string, articles: PublicFaq[]): PublicFaq | null {
  const tokens = new Set(words(message));
  let best: { article: PublicFaq; score: number } | null = null;
  for (const article of articles) {
    const candidates = [...article.keywords, ...words(article.question)].map((item) =>
      item.toLocaleLowerCase("uz"),
    );
    const score = candidates.reduce((sum, keyword) => sum + (tokens.has(keyword) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { article, score };
  }
  return best?.article ?? null;
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function listPublicFaq(locale = "uz") {
  return prisma.faqArticle.findMany({
    where: { locale, isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    select: { slug: true, question: true, answer: true, keywords: true },
  });
}

export async function supportChat(
  userId: string,
  input: { message: string; requestId: string; conversationId?: string },
  provider: SupportAiProvider = deterministicSupportProvider,
) {
  const prepared = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`support-chat:${input.requestId}`}, 0))`;
    const existing = await tx.aiMessage.findUnique({
      where: { requestId: input.requestId },
      include: { conversation: { select: { userId: true } } },
    });
    if (existing) {
      if (existing.conversation.userId !== userId || existing.content !== input.message) {
        throw new SupportError("IDEMPOTENCY_CONFLICT");
      }
      const reply = await tx.aiMessage.findUnique({
        where: { replyToRequestId: input.requestId },
      });
      return { conversationId: existing.conversationId, reply, duplicate: true };
    }
    let conversation;
    if (input.conversationId) {
      conversation = await tx.aiConversation.findFirst({
        where: { id: input.conversationId, userId },
      });
      if (!conversation) throw new SupportError("NOT_FOUND");
    } else {
      conversation = await tx.aiConversation.create({ data: { userId } });
    }
    await tx.aiMessage.create({
      data: {
        conversationId: conversation.id,
        requestId: input.requestId,
        role: "USER",
        content: input.message,
      },
    });
    return { conversationId: conversation.id, reply: null, duplicate: false };
  });
  if (prepared.reply) {
    return {
      conversationId: prepared.conversationId,
      response: prepared.reply.content,
      source: prepared.reply.provider,
      toolName: prepared.reply.toolName,
      toolResult: prepared.reply.metadata,
      duplicate: true,
    };
  }

  const faq = findFaqAnswer(input.message, await listPublicFaq("uz"));
  const result = faq
    ? { text: faq.answer, source: "FAQ", toolName: undefined, toolResult: { slug: faq.slug } }
    : {
        ...(await provider.respond({ userId, message: input.message, requestId: input.requestId })),
        source: provider.name,
      };
  try {
    const reply = await prisma.aiMessage.create({
      data: {
        conversationId: prepared.conversationId,
        replyToRequestId: input.requestId,
        role: "ASSISTANT",
        content: result.text,
        provider: result.source,
        toolName: result.toolName,
        metadata: result.toolResult === undefined ? undefined : jsonSafe(result.toolResult),
      },
    });
    return {
      conversationId: prepared.conversationId,
      response: reply.content,
      source: reply.provider,
      toolName: reply.toolName,
      toolResult: reply.metadata,
      duplicate: prepared.duplicate,
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
      throw error;
    const reply = await prisma.aiMessage.findUniqueOrThrow({
      where: { replyToRequestId: input.requestId },
    });
    return {
      conversationId: prepared.conversationId,
      response: reply.content,
      source: reply.provider,
      toolName: reply.toolName,
      toolResult: reply.metadata,
      duplicate: true,
    };
  }
}
