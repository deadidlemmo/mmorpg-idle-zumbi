-- AlterTable
ALTER TABLE "items" ADD COLUMN     "healFlat" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxTier" INTEGER,
ADD COLUMN     "minTier" INTEGER,
ADD COLUMN     "usableInCombat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usableOutOfCombat" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "character_potion_configs" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "potionItemId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "hpThresholdPercent" INTEGER NOT NULL DEFAULT 35,
    "useInManualCombat" BOOLEAN NOT NULL DEFAULT true,
    "useInAutoCombat" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_potion_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "character_potion_configs_characterId_key" ON "character_potion_configs"("characterId");

-- CreateIndex
CREATE INDEX "character_potion_configs_characterId_idx" ON "character_potion_configs"("characterId");

-- CreateIndex
CREATE INDEX "character_potion_configs_potionItemId_idx" ON "character_potion_configs"("potionItemId");

-- CreateIndex
CREATE INDEX "items_rarity_idx" ON "items"("rarity");

-- CreateIndex
CREATE INDEX "items_minTier_maxTier_idx" ON "items"("minTier", "maxTier");

-- AddForeignKey
ALTER TABLE "character_potion_configs" ADD CONSTRAINT "character_potion_configs_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_potion_configs" ADD CONSTRAINT "character_potion_configs_potionItemId_fkey" FOREIGN KEY ("potionItemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
