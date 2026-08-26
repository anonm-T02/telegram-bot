import { prisma } from "@nova-org/db";

export type SupportTicketInput = {
  subject: string;
  message: string;
  category: string;
  idempotencyKey: string;
};

export class SupportError extends Error {
  constructor(readonly code: "NOT_FOUND" | "IDEMPOTENCY_CONFLICT") {
    super(code);
    this.name = "SupportError";
  }
}

export async function createSupportTicket(userId: string, input: SupportTicketInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`support-ticket:${input.idempotencyKey}`}, 0))`;
    const existing = await tx.supportTicket.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (existing) {
      if (
        existing.userId !== userId ||
        existing.subject !== input.subject ||
        existing.category !== input.category ||
        existing.messages[0]?.content !== input.message
      ) {
        throw new SupportError("IDEMPOTENCY_CONFLICT");
      }
      return { ticket: existing, duplicate: true };
    }
    const ticket = await tx.supportTicket.create({
      data: {
        userId,
        subject: input.subject,
        category: input.category,
        idempotencyKey: input.idempotencyKey,
        messages: { create: { userId, actorType: "USER", content: input.message } },
      },
    });
    return { ticket, duplicate: false };
  });
}

export async function listSupportTickets(userId: string, limit: number) {
  return prisma.supportTicket.findMany({
    where: { userId },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getSupportTicket(userId: string, id: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, userId },
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, actorType: true, content: true, createdAt: true },
      },
    },
  });
  if (!ticket) throw new SupportError("NOT_FOUND");
  return ticket;
}
