-- AlterTable
ALTER TABLE "auto_combat_sessions"
ADD COLUMN "battleTargetMobId" TEXT,
ADD COLUMN "battleTargetEncounterId" TEXT,
ADD COLUMN "battleTargetTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "battleTargetRemaining" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "auto_combat_sessions_battleTargetMobId_idx" ON "auto_combat_sessions"("battleTargetMobId");

-- CreateIndex
CREATE INDEX "auto_combat_sessions_battleTargetEncounterId_idx" ON "auto_combat_sessions"("battleTargetEncounterId");
