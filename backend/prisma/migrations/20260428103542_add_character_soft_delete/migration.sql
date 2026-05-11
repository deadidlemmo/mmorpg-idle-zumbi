-- AlterEnum
ALTER TYPE "CharacterStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "characters_deletedAt_idx" ON "characters"("deletedAt");

-- CreateIndex
CREATE INDEX "characters_userId_status_idx" ON "characters"("userId", "status");
