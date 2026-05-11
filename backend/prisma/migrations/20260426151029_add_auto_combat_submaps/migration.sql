-- CreateEnum
CREATE TYPE "AutoCombatSessionStatus" AS ENUM ('ACTIVE', 'FINISHED', 'STOPPED', 'DEFEATED');

-- AlterTable
ALTER TABLE "game_maps" ADD COLUMN     "maxLevel" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "minLevel" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "sub_maps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" INTEGER NOT NULL,
    "minLevel" INTEGER NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "mapId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_map_encounters" (
    "id" TEXT NOT NULL,
    "subMapId" TEXT NOT NULL,
    "mobId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_map_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_combat_sessions" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "subMapId" TEXT NOT NULL,
    "status" "AutoCombatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "lastProcessedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 21600,
    "roundDurationSeconds" INTEGER NOT NULL DEFAULT 5,
    "totalCombatsResolved" INTEGER NOT NULL DEFAULT 0,
    "totalRoundsResolved" INTEGER NOT NULL DEFAULT 0,
    "totalXpGained" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_combat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_combat_session_loots" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_combat_session_loots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_combat_session_mob_summaries" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "mobId" TEXT NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "xpGained" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_combat_session_mob_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sub_maps_mapId_idx" ON "sub_maps"("mapId");

-- CreateIndex
CREATE INDEX "sub_maps_tier_idx" ON "sub_maps"("tier");

-- CreateIndex
CREATE INDEX "sub_maps_minLevel_maxLevel_idx" ON "sub_maps"("minLevel", "maxLevel");

-- CreateIndex
CREATE UNIQUE INDEX "sub_maps_mapId_name_key" ON "sub_maps"("mapId", "name");

-- CreateIndex
CREATE INDEX "sub_map_encounters_subMapId_idx" ON "sub_map_encounters"("subMapId");

-- CreateIndex
CREATE INDEX "sub_map_encounters_mobId_idx" ON "sub_map_encounters"("mobId");

-- CreateIndex
CREATE UNIQUE INDEX "sub_map_encounters_subMapId_mobId_key" ON "sub_map_encounters"("subMapId", "mobId");

-- CreateIndex
CREATE INDEX "auto_combat_sessions_characterId_idx" ON "auto_combat_sessions"("characterId");

-- CreateIndex
CREATE INDEX "auto_combat_sessions_subMapId_idx" ON "auto_combat_sessions"("subMapId");

-- CreateIndex
CREATE INDEX "auto_combat_sessions_status_idx" ON "auto_combat_sessions"("status");

-- CreateIndex
CREATE INDEX "auto_combat_sessions_startedAt_idx" ON "auto_combat_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "auto_combat_sessions_endsAt_idx" ON "auto_combat_sessions"("endsAt");

-- CreateIndex
CREATE INDEX "auto_combat_session_loots_sessionId_idx" ON "auto_combat_session_loots"("sessionId");

-- CreateIndex
CREATE INDEX "auto_combat_session_loots_itemId_idx" ON "auto_combat_session_loots"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "auto_combat_session_loots_sessionId_itemId_key" ON "auto_combat_session_loots"("sessionId", "itemId");

-- CreateIndex
CREATE INDEX "auto_combat_session_mob_summaries_sessionId_idx" ON "auto_combat_session_mob_summaries"("sessionId");

-- CreateIndex
CREATE INDEX "auto_combat_session_mob_summaries_mobId_idx" ON "auto_combat_session_mob_summaries"("mobId");

-- CreateIndex
CREATE UNIQUE INDEX "auto_combat_session_mob_summaries_sessionId_mobId_key" ON "auto_combat_session_mob_summaries"("sessionId", "mobId");

-- CreateIndex
CREATE INDEX "game_maps_tier_idx" ON "game_maps"("tier");

-- CreateIndex
CREATE INDEX "game_maps_minLevel_maxLevel_idx" ON "game_maps"("minLevel", "maxLevel");

-- CreateIndex
CREATE INDEX "mobs_tier_idx" ON "mobs"("tier");

-- CreateIndex
CREATE INDEX "mobs_level_idx" ON "mobs"("level");

-- AddForeignKey
ALTER TABLE "sub_maps" ADD CONSTRAINT "sub_maps_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_map_encounters" ADD CONSTRAINT "sub_map_encounters_subMapId_fkey" FOREIGN KEY ("subMapId") REFERENCES "sub_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_map_encounters" ADD CONSTRAINT "sub_map_encounters_mobId_fkey" FOREIGN KEY ("mobId") REFERENCES "mobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_combat_sessions" ADD CONSTRAINT "auto_combat_sessions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_combat_sessions" ADD CONSTRAINT "auto_combat_sessions_subMapId_fkey" FOREIGN KEY ("subMapId") REFERENCES "sub_maps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_combat_session_loots" ADD CONSTRAINT "auto_combat_session_loots_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "auto_combat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_combat_session_loots" ADD CONSTRAINT "auto_combat_session_loots_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_combat_session_mob_summaries" ADD CONSTRAINT "auto_combat_session_mob_summaries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "auto_combat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_combat_session_mob_summaries" ADD CONSTRAINT "auto_combat_session_mob_summaries_mobId_fkey" FOREIGN KEY ("mobId") REFERENCES "mobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
