/*
  Warnings:

  - A unique constraint covering the columns `[userId,name]` on the table `characters` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mobId,itemId]` on the table `mob_drops` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "character_potion_configs_enabled_idx" ON "character_potion_configs"("enabled");

-- CreateIndex
CREATE INDEX "characters_status_idx" ON "characters"("status");

-- CreateIndex
CREATE INDEX "characters_level_idx" ON "characters"("level");

-- CreateIndex
CREATE UNIQUE INDEX "characters_userId_name_key" ON "characters"("userId", "name");

-- CreateIndex
CREATE INDEX "combat_logs_round_idx" ON "combat_logs"("round");

-- CreateIndex
CREATE INDEX "combats_startedAt_idx" ON "combats"("startedAt");

-- CreateIndex
CREATE INDEX "equipment_mainHandId_idx" ON "equipment"("mainHandId");

-- CreateIndex
CREATE INDEX "equipment_offHandId_idx" ON "equipment"("offHandId");

-- CreateIndex
CREATE INDEX "equipment_headId_idx" ON "equipment"("headId");

-- CreateIndex
CREATE INDEX "equipment_armorId_idx" ON "equipment"("armorId");

-- CreateIndex
CREATE INDEX "equipment_pantsId_idx" ON "equipment"("pantsId");

-- CreateIndex
CREATE INDEX "equipment_bootsId_idx" ON "equipment"("bootsId");

-- CreateIndex
CREATE INDEX "inventory_items_type_idx" ON "inventory_items"("type");

-- CreateIndex
CREATE UNIQUE INDEX "mob_drops_mobId_itemId_key" ON "mob_drops"("mobId", "itemId");
