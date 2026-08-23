-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "content" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_userId_createdAt_idx" ON "chat_messages"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_characterId_createdAt_idx" ON "chat_messages"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_deletedAt_idx" ON "chat_messages"("deletedAt");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
