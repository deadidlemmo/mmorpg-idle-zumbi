-- AlterTable
ALTER TABLE "gathering_sessions" ADD COLUMN     "collectedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "collectedXp" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "gathering_sessions_collectedQuantity_idx" ON "gathering_sessions"("collectedQuantity");

-- CreateIndex
CREATE INDEX "gathering_sessions_collectedXp_idx" ON "gathering_sessions"("collectedXp");
