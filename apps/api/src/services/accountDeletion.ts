import { Prisma, prisma } from "@nova-org/db";

export type AccountDeletionRequestStatus = "PENDING" | "CANCELLED" | "COMPLETED";

export interface AccountDeletionRequestRecord {
  id: string;
  userId: string;
  status: AccountDeletionRequestStatus;
  reason: string | null;
  requestedAt: Date;
}

export interface AccountDeletionRepository {
  createOrGetPending(input: {
    userId: string;
    reason?: string;
  }): Promise<{ record: AccountDeletionRequestRecord; created: boolean }>;
}

/**
 * Records a reviewable deletion request. Account data is deliberately not
 * deleted here: a separate, audited retention workflow must complete it.
 */
export async function requestAccountDeletion(
  repository: AccountDeletionRepository,
  input: { userId: string; reason?: string },
): Promise<{ record: AccountDeletionRequestRecord; created: boolean }> {
  return repository.createOrGetPending(input);
}

export const accountDeletionRepository: AccountDeletionRepository = {
  async createOrGetPending(input) {
    const existing = await prisma.accountDeletionRequest.findFirst({
      where: { userId: input.userId, status: "PENDING" },
    });
    if (existing) return { record: existing, created: false };

    try {
      const record = await prisma.accountDeletionRequest.create({
        data: { userId: input.userId, reason: input.reason },
      });
      return { record, created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      const record = await prisma.accountDeletionRequest.findFirstOrThrow({
        where: { userId: input.userId, status: "PENDING" },
      });
      return { record, created: false };
    }
  },
};
