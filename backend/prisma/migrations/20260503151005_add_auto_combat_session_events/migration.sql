-- CreateTable
CREATE TABLE "auto_combat_session_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_combat_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auto_combat_session_events_sessionId_idx" ON "auto_combat_session_events"("sessionId");

-- CreateIndex
CREATE INDEX "auto_combat_session_events_characterId_idx" ON "auto_combat_session_events"("characterId");

-- CreateIndex
CREATE INDEX "auto_combat_session_events_type_idx" ON "auto_combat_session_events"("type");

-- CreateIndex
CREATE INDEX "auto_combat_session_events_createdAt_idx" ON "auto_combat_session_events"("createdAt");

-- CreateIndex
CREATE INDEX "auto_combat_session_events_sessionId_createdAt_idx" ON "auto_combat_session_events"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "auto_combat_session_events_characterId_createdAt_idx" ON "auto_combat_session_events"("characterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "auto_combat_session_events_sessionId_sequence_key" ON "auto_combat_session_events"("sessionId", "sequence");

-- AddForeignKey
ALTER TABLE "auto_combat_session_events" ADD CONSTRAINT "auto_combat_session_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "auto_combat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_combat_session_events" ADD CONSTRAINT "auto_combat_session_events_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
