-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('ACTIVE', 'DEAD', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "ItemSlot" AS ENUM ('MAIN_HAND', 'OFF_HAND', 'HEAD', 'ARMOR', 'PANTS', 'BOOTS', 'MATERIAL', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('EQUIPMENT', 'MATERIAL', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "CombatStatus" AS ENUM ('IN_PROGRESS', 'PLAYER_WIN', 'PLAYER_LOSE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CombatActor" AS ENUM ('PLAYER', 'MOB', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "baseAttack" INTEGER NOT NULL,
    "baseDefense" INTEGER NOT NULL,
    "baseSpeed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_maps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CharacterStatus" NOT NULL DEFAULT 'ACTIVE',
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "currentHp" INTEGER,
    "maxHp" INTEGER,
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "mapId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "hp" INTEGER NOT NULL,
    "attack" INTEGER NOT NULL,
    "defense" INTEGER NOT NULL,
    "speed" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "mapId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" INTEGER NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "slot" "ItemSlot" NOT NULL,
    "family" TEXT NOT NULL,
    "classId" TEXT,
    "mapId" TEXT,
    "attackBonus" INTEGER NOT NULL DEFAULT 0,
    "defenseBonus" INTEGER NOT NULL DEFAULT 0,
    "hpBonus" INTEGER NOT NULL DEFAULT 0,
    "speedBonus" INTEGER NOT NULL DEFAULT 0,
    "isCraftable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryItemType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "mainHandId" TEXT,
    "offHandId" TEXT,
    "headId" TEXT,
    "armorId" TEXT,
    "pantsId" TEXT,
    "bootsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mob_drops" (
    "id" TEXT NOT NULL,
    "mobId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dropChance" INTEGER NOT NULL DEFAULT 100,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mob_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combats" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "mobId" TEXT NOT NULL,
    "status" "CombatStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "playerStartHp" INTEGER NOT NULL,
    "playerEndHp" INTEGER,
    "mobStartHp" INTEGER NOT NULL,
    "mobEndHp" INTEGER,
    "xpGained" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "combats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combat_logs" (
    "id" TEXT NOT NULL,
    "combatId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "actor" "CombatActor" NOT NULL,
    "message" TEXT NOT NULL,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combat_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "game_classes_name_key" ON "game_classes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "game_maps_name_key" ON "game_maps"("name");

-- CreateIndex
CREATE INDEX "characters_userId_idx" ON "characters"("userId");

-- CreateIndex
CREATE INDEX "characters_classId_idx" ON "characters"("classId");

-- CreateIndex
CREATE INDEX "characters_mapId_idx" ON "characters"("mapId");

-- CreateIndex
CREATE INDEX "mobs_mapId_idx" ON "mobs"("mapId");

-- CreateIndex
CREATE INDEX "items_classId_idx" ON "items"("classId");

-- CreateIndex
CREATE INDEX "items_mapId_idx" ON "items"("mapId");

-- CreateIndex
CREATE INDEX "items_tier_idx" ON "items"("tier");

-- CreateIndex
CREATE INDEX "items_slot_idx" ON "items"("slot");

-- CreateIndex
CREATE INDEX "inventory_items_characterId_idx" ON "inventory_items"("characterId");

-- CreateIndex
CREATE INDEX "inventory_items_itemId_idx" ON "inventory_items"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_characterId_itemId_key" ON "inventory_items"("characterId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_characterId_key" ON "equipment"("characterId");

-- CreateIndex
CREATE INDEX "mob_drops_mobId_idx" ON "mob_drops"("mobId");

-- CreateIndex
CREATE INDEX "mob_drops_itemId_idx" ON "mob_drops"("itemId");

-- CreateIndex
CREATE INDEX "combats_characterId_idx" ON "combats"("characterId");

-- CreateIndex
CREATE INDEX "combats_mobId_idx" ON "combats"("mobId");

-- CreateIndex
CREATE INDEX "combats_status_idx" ON "combats"("status");

-- CreateIndex
CREATE INDEX "combat_logs_combatId_idx" ON "combat_logs"("combatId");

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_classId_fkey" FOREIGN KEY ("classId") REFERENCES "game_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobs" ADD CONSTRAINT "mobs_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_classId_fkey" FOREIGN KEY ("classId") REFERENCES "game_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_mainHandId_fkey" FOREIGN KEY ("mainHandId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_offHandId_fkey" FOREIGN KEY ("offHandId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_headId_fkey" FOREIGN KEY ("headId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_armorId_fkey" FOREIGN KEY ("armorId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_pantsId_fkey" FOREIGN KEY ("pantsId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_bootsId_fkey" FOREIGN KEY ("bootsId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mob_drops" ADD CONSTRAINT "mob_drops_mobId_fkey" FOREIGN KEY ("mobId") REFERENCES "mobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mob_drops" ADD CONSTRAINT "mob_drops_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combats" ADD CONSTRAINT "combats_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combats" ADD CONSTRAINT "combats_mobId_fkey" FOREIGN KEY ("mobId") REFERENCES "mobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combat_logs" ADD CONSTRAINT "combat_logs_combatId_fkey" FOREIGN KEY ("combatId") REFERENCES "combats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
