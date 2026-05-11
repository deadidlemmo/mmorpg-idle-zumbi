/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `items` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MaterialOrigin" AS ENUM ('DESMANCHE', 'COLETA', 'CONTENCAO', 'ARSENAL', 'PATRULHA', 'TECNOVARREDURA', 'DROP_MOBS');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('ACTIVE', 'STOPPED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CraftIngredientRole" AS ENUM ('MAIN_COMPONENT', 'SHARED_MATERIAL', 'RARE_MOB_DROP');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "materialOrigin" "MaterialOrigin";

-- CreateTable
CREATE TABLE "crafting_recipes" (
    "id" TEXT NOT NULL,
    "outputItemId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "outputQuantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crafting_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crafting_ingredients" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "role" "CraftIngredientRole" NOT NULL,
    "origin" "MaterialOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crafting_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gathering_sessions" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "origin" "MaterialOrigin" NOT NULL,
    "targetMaterialId" TEXT NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastResolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progressRemainder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gathering_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crafting_recipes_outputItemId_key" ON "crafting_recipes"("outputItemId");

-- CreateIndex
CREATE INDEX "crafting_recipes_tier_idx" ON "crafting_recipes"("tier");

-- CreateIndex
CREATE INDEX "crafting_recipes_isActive_idx" ON "crafting_recipes"("isActive");

-- CreateIndex
CREATE INDEX "crafting_ingredients_recipeId_idx" ON "crafting_ingredients"("recipeId");

-- CreateIndex
CREATE INDEX "crafting_ingredients_itemId_idx" ON "crafting_ingredients"("itemId");

-- CreateIndex
CREATE INDEX "crafting_ingredients_origin_idx" ON "crafting_ingredients"("origin");

-- CreateIndex
CREATE INDEX "crafting_ingredients_role_idx" ON "crafting_ingredients"("role");

-- CreateIndex
CREATE UNIQUE INDEX "crafting_ingredients_recipeId_itemId_key" ON "crafting_ingredients"("recipeId", "itemId");

-- CreateIndex
CREATE INDEX "gathering_sessions_characterId_idx" ON "gathering_sessions"("characterId");

-- CreateIndex
CREATE INDEX "gathering_sessions_mapId_idx" ON "gathering_sessions"("mapId");

-- CreateIndex
CREATE INDEX "gathering_sessions_targetMaterialId_idx" ON "gathering_sessions"("targetMaterialId");

-- CreateIndex
CREATE INDEX "gathering_sessions_origin_idx" ON "gathering_sessions"("origin");

-- CreateIndex
CREATE INDEX "gathering_sessions_status_idx" ON "gathering_sessions"("status");

-- CreateIndex
CREATE INDEX "gathering_sessions_characterId_status_idx" ON "gathering_sessions"("characterId", "status");

-- CreateIndex
CREATE INDEX "gathering_sessions_startedAt_idx" ON "gathering_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "auto_combat_sessions_characterId_status_idx" ON "auto_combat_sessions"("characterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "items_name_key" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_materialOrigin_idx" ON "items"("materialOrigin");

-- CreateIndex
CREATE INDEX "items_isCraftable_idx" ON "items"("isCraftable");

-- AddForeignKey
ALTER TABLE "crafting_recipes" ADD CONSTRAINT "crafting_recipes_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_ingredients" ADD CONSTRAINT "crafting_ingredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "crafting_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_ingredients" ADD CONSTRAINT "crafting_ingredients_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_sessions" ADD CONSTRAINT "gathering_sessions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_sessions" ADD CONSTRAINT "gathering_sessions_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_sessions" ADD CONSTRAINT "gathering_sessions_targetMaterialId_fkey" FOREIGN KEY ("targetMaterialId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
