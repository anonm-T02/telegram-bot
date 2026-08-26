CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

CREATE TABLE "FaqArticle" ("id" TEXT NOT NULL, "slug" TEXT NOT NULL, "locale" TEXT NOT NULL DEFAULT 'uz', "question" TEXT NOT NULL, "answer" TEXT NOT NULL, "keywords" TEXT[] NOT NULL, "isPublished" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FaqArticle_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SupportTicket" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "subject" TEXT NOT NULL, "category" TEXT NOT NULL, "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN', "idempotencyKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "resolvedAt" TIMESTAMP(3), CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SupportMessage" ("id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "userId" TEXT, "actorType" "SupportActorType" NOT NULL, "content" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AiConversation" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AiMessage" ("id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "requestId" TEXT, "replyToRequestId" TEXT, "role" TEXT NOT NULL, "content" TEXT NOT NULL, "provider" TEXT, "toolName" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "FaqArticle_slug_key" ON "FaqArticle"("slug");
CREATE INDEX "FaqArticle_isPublished_locale_sortOrder_idx" ON "FaqArticle"("isPublished", "locale", "sortOrder");
CREATE UNIQUE INDEX "SupportTicket_idempotencyKey_key" ON "SupportTicket"("idempotencyKey");
CREATE INDEX "SupportTicket_userId_status_createdAt_idx" ON "SupportTicket"("userId", "status", "createdAt");
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");
CREATE INDEX "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId", "updatedAt");
CREATE UNIQUE INDEX "AiMessage_requestId_key" ON "AiMessage"("requestId");
CREATE UNIQUE INDEX "AiMessage_replyToRequestId_key" ON "AiMessage"("replyToRequestId");
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FaqArticle" ("id", "slug", "locale", "question", "answer", "keywords", "sortOrder", "updatedAt") VALUES
('faq-balance', 'balance', 'uz', 'Balans qanday ishlaydi?', 'Balans faqat server tasdiqlagan ledger operatsiyalari orqali o‘zgaradi.', ARRAY['balans','coin','microcoin','tanga'], 10, CURRENT_TIMESTAMP),
('faq-click', 'click-rewards', 'uz', 'Click mukofoti qanday ishlaydi?', 'Har bir server tasdiqlagan click 1 microcoin beradi. Cooldown 2 soniya, kunlik limit 1000 ta.', ARRAY['click','tap','bosish','limit','cooldown'], 20, CURRENT_TIMESTAMP),
('faq-referral', 'referrals', 'uz', 'Referral bonuslari qachon ochiladi?', 'Referral bonuslari 3 va 7 faol kun milestone hamda sifat tekshiruvidan keyin server tomonidan ochiladi.', ARRAY['referral','taklif','bonus','do''st'], 30, CURRENT_TIMESTAMP),
('faq-reward', 'rewards', 'uz', 'Telegram mukofoti qanday olinadi?', 'Kamida 1 available coin kerak. Test rejimida so‘rov risk va kunlik budjet tekshiruvidan o‘tadi; real payout yoqilmagan.', ARRAY['reward','stars','mukofot','payout'], 40, CURRENT_TIMESTAMP);
