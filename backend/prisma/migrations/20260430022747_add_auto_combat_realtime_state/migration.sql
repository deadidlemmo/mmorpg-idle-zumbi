-- AlterTable
ALTER TABLE "auto_combat_sessions" ADD COLUMN     "currentCombatIndex" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "currentMobHp" INTEGER,
ADD COLUMN     "currentMobId" TEXT,
ADD COLUMN     "currentMobMaxHp" INTEGER,
ADD COLUMN     "currentRound" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "roundDurationSeconds" SET DEFAULT 1;

-- CreateIndex
CREATE INDEX "auto_combat_sessions_currentMobId_idx" ON "auto_combat_sessions"("currentMobId");

-- AddForeignKey
ALTER TABLE "auto_combat_sessions" ADD CONSTRAINT "auto_combat_sessions_currentMobId_fkey" FOREIGN KEY ("currentMobId") REFERENCES "mobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
