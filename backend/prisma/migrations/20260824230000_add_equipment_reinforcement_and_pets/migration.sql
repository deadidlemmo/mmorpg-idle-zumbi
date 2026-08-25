-- CreateEnum
CREATE TYPE "CharacterPetStatus" AS ENUM ('INCUBATING', 'AVAILABLE');

-- AlterTable
ALTER TABLE "items"
ADD COLUMN "baseItemId" TEXT,
ADD COLUMN "enhancementLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pet_definitions" (
  "id" TEXT NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "tier" INTEGER NOT NULL,
  "rarity" "Rarity" NOT NULL,
  "cocoonItemId" TEXT NOT NULL,
  "incubationSeconds" INTEGER NOT NULL,
  "fragmentCost" INTEGER NOT NULL,
  "goldCost" INTEGER NOT NULL,
  "assetKey" VARCHAR(120),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pet_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_pets" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "petDefinitionId" TEXT NOT NULL,
  "status" "CharacterPetStatus" NOT NULL DEFAULT 'INCUBATING',
  "incubationRequestId" VARCHAR(120) NOT NULL,
  "incubationStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "incubationEndsAt" TIMESTAMP(3) NOT NULL,
  "hatchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "character_pets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_baseItemId_enhancementLevel_key"
ON "items"("baseItemId", "enhancementLevel");

-- CreateIndex
CREATE INDEX "items_baseItemId_idx" ON "items"("baseItemId");

-- CreateIndex
CREATE INDEX "items_enhancementLevel_idx" ON "items"("enhancementLevel");

-- CreateIndex
CREATE UNIQUE INDEX "pet_definitions_key_key" ON "pet_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pet_definitions_name_key" ON "pet_definitions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "pet_definitions_cocoonItemId_key"
ON "pet_definitions"("cocoonItemId");

-- CreateIndex
CREATE INDEX "pet_definitions_tier_isActive_sortOrder_idx"
ON "pet_definitions"("tier", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "character_pets_incubationRequestId_key"
ON "character_pets"("incubationRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "character_pets_characterId_petDefinitionId_key"
ON "character_pets"("characterId", "petDefinitionId");

-- CreateIndex
CREATE INDEX "character_pets_characterId_status_idx"
ON "character_pets"("characterId", "status");

-- CreateIndex
CREATE INDEX "character_pets_incubationEndsAt_idx"
ON "character_pets"("incubationEndsAt");

-- AddForeignKey
ALTER TABLE "items"
ADD CONSTRAINT "items_baseItemId_fkey"
FOREIGN KEY ("baseItemId") REFERENCES "items"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_definitions"
ADD CONSTRAINT "pet_definitions_cocoonItemId_fkey"
FOREIGN KEY ("cocoonItemId") REFERENCES "items"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_pets"
ADD CONSTRAINT "character_pets_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "characters"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_pets"
ADD CONSTRAINT "character_pets_petDefinitionId_fkey"
FOREIGN KEY ("petDefinitionId") REFERENCES "pet_definitions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE "items"
ADD CONSTRAINT "items_enhancement_level_check"
CHECK ("enhancementLevel" BETWEEN 0 AND 3);

-- CheckConstraint
ALTER TABLE "items"
ADD CONSTRAINT "items_enhancement_base_check"
CHECK (
  ("enhancementLevel" = 0 AND "baseItemId" IS NULL)
  OR ("enhancementLevel" BETWEEN 1 AND 3 AND "baseItemId" IS NOT NULL)
);

-- CheckConstraint
ALTER TABLE "pet_definitions"
ADD CONSTRAINT "pet_definitions_economy_check"
CHECK (
  "tier" BETWEEN 1 AND 10
  AND "incubationSeconds" > 0
  AND "fragmentCost" >= 0
  AND "goldCost" >= 0
);
