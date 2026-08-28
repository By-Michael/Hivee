-- Help & Support AI assistant: per-user chat sessions the user explicitly
-- opts in to saving (see SupportChatSession / SupportChatMessage comments
-- in schema.prisma). Unsaved conversations never create a row here at all.

CREATE TABLE "support_chat_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityId" TEXT,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_chat_sessions_userId_idx" ON "support_chat_sessions"("userId");
CREATE INDEX "support_chat_sessions_communityId_idx" ON "support_chat_sessions"("communityId");
CREATE INDEX "support_chat_messages_sessionId_idx" ON "support_chat_messages"("sessionId");

ALTER TABLE "support_chat_sessions" ADD CONSTRAINT "support_chat_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_chat_messages" ADD CONSTRAINT "support_chat_messages_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "support_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
