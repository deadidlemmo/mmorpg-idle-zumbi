-- AlterTable
ALTER TABLE "items" ADD COLUMN     "baseGatheringRatePerHour" INTEGER,
ADD COLUMN     "gatheringXpPerUnit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "requiredGatheringLevel" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "character_gathering_skills" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "origin" "MaterialOrigin" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_gathering_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_gathering_skills_characterId_idx" ON "character_gathering_skills"("characterId");

-- CreateIndex
CREATE INDEX "character_gathering_skills_origin_idx" ON "character_gathering_skills"("origin");

-- CreateIndex
CREATE INDEX "character_gathering_skills_level_idx" ON "character_gathering_skills"("level");

-- CreateIndex
CREATE INDEX "character_gathering_skills_characterId_level_idx" ON "character_gathering_skills"("characterId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "character_gathering_skills_characterId_origin_key" ON "character_gathering_skills"("characterId", "origin");

-- CreateIndex
CREATE INDEX "items_materialOrigin_requiredGatheringLevel_idx" ON "items"("materialOrigin", "requiredGatheringLevel");

-- CreateIndex
CREATE INDEX "items_requiredGatheringLevel_idx" ON "items"("requiredGatheringLevel");

-- CreateIndex
CREATE INDEX "items_baseGatheringRatePerHour_idx" ON "items"("baseGatheringRatePerHour");

-- AddForeignKey
ALTER TABLE "character_gathering_skills" ADD CONSTRAINT "character_gathering_skills_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
