-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "avatarKey" TEXT;

-- CreateIndex
CREATE INDEX "characters_avatarKey_idx" ON "characters"("avatarKey");
