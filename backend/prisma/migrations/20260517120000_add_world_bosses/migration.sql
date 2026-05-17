-- CreateEnum
CREATE TYPE "WorldBossEventStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'DEFEATED', 'EXPIRED', 'REWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorldBossRewardType" AS ENUM ('XP', 'GOLD', 'MATERIAL', 'CONSUMABLE', 'EQUIPMENT', 'ITEM', 'PET_EGG');

-- CreateTable
CREATE TABLE "world_bosses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "mapId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "minLevel" INTEGER NOT NULL,
    "maxLevel" INTEGER NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "maxHp" INTEGER,
    "hpPerParticipant" INTEGER NOT NULL DEFAULT 0,
    "powerScalingFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scalingFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "minParticipantsExpected" INTEGER NOT NULL DEFAULT 1,
    "maxScalingCap" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "scalingWindowSeconds" INTEGER NOT NULL DEFAULT 600,
    "attackPower" INTEGER NOT NULL DEFAULT 0,
    "defense" INTEGER NOT NULL DEFAULT 0,
    "resistance" INTEGER NOT NULL DEFAULT 0,
    "mutationLevel" INTEGER NOT NULL DEFAULT 1,
    "damageReduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enrageMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "durationSeconds" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'NORMAL',
    "riskLevel" INTEGER NOT NULL DEFAULT 1,
    "minParticipationSeconds" INTEGER NOT NULL DEFAULT 300,
    "minParticipationDamage" INTEGER NOT NULL DEFAULT 1,
    "imageUrl" TEXT,
    "assetKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_bosses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_boss_events" (
    "id" TEXT NOT NULL,
    "worldBossId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "status" "WorldBossEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "currentHp" INTEGER NOT NULL,
    "totalDamage" INTEGER NOT NULL DEFAULT 0,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "hpLockedAt" TIMESTAMP(3),
    "defeatedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_boss_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_boss_participants" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "damageDealt" INTEGER NOT NULL DEFAULT 0,
    "contributionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastContributionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "rewardGranted" BOOLEAN NOT NULL DEFAULT false,
    "rewardGrantedAt" TIMESTAMP(3),
    "rank" INTEGER,
    "eligibleForReward" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_boss_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_boss_rewards" (
    "id" TEXT NOT NULL,
    "worldBossId" TEXT NOT NULL,
    "rewardType" "WorldBossRewardType" NOT NULL,
    "itemId" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "chance" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "guaranteed" BOOLEAN NOT NULL DEFAULT false,
    "onlyIfDefeated" BOOLEAN NOT NULL DEFAULT false,
    "requiresMinParticipation" BOOLEAN NOT NULL DEFAULT true,
    "minContributionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minRankPercent" DOUBLE PRECISION,
    "rarity" "Rarity",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_boss_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_boss_granted_rewards" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "itemId" TEXT,
    "rewardType" "WorldBossRewardType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "rarity" "Rarity",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_boss_granted_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "world_bosses_slug_key" ON "world_bosses"("slug");
CREATE INDEX "world_bosses_mapId_idx" ON "world_bosses"("mapId");
CREATE INDEX "world_bosses_tier_idx" ON "world_bosses"("tier");
CREATE INDEX "world_bosses_minLevel_maxLevel_idx" ON "world_bosses"("minLevel", "maxLevel");
CREATE INDEX "world_bosses_isActive_idx" ON "world_bosses"("isActive");
CREATE INDEX "world_bosses_sortOrder_idx" ON "world_bosses"("sortOrder");
CREATE INDEX "world_boss_events_worldBossId_idx" ON "world_boss_events"("worldBossId");
CREATE INDEX "world_boss_events_mapId_idx" ON "world_boss_events"("mapId");
CREATE INDEX "world_boss_events_tier_idx" ON "world_boss_events"("tier");
CREATE INDEX "world_boss_events_status_idx" ON "world_boss_events"("status");
CREATE INDEX "world_boss_events_startsAt_idx" ON "world_boss_events"("startsAt");
CREATE INDEX "world_boss_events_endsAt_idx" ON "world_boss_events"("endsAt");
CREATE UNIQUE INDEX "world_boss_participants_eventId_characterId_key" ON "world_boss_participants"("eventId", "characterId");
CREATE INDEX "world_boss_participants_eventId_idx" ON "world_boss_participants"("eventId");
CREATE INDEX "world_boss_participants_characterId_idx" ON "world_boss_participants"("characterId");
CREATE INDEX "world_boss_participants_rewardGranted_idx" ON "world_boss_participants"("rewardGranted");
CREATE INDEX "world_boss_participants_eligibleForReward_idx" ON "world_boss_participants"("eligibleForReward");
CREATE INDEX "world_boss_rewards_worldBossId_idx" ON "world_boss_rewards"("worldBossId");
CREATE INDEX "world_boss_rewards_rewardType_idx" ON "world_boss_rewards"("rewardType");
CREATE INDEX "world_boss_rewards_itemId_idx" ON "world_boss_rewards"("itemId");
CREATE INDEX "world_boss_rewards_sortOrder_idx" ON "world_boss_rewards"("sortOrder");
CREATE INDEX "world_boss_granted_rewards_participantId_idx" ON "world_boss_granted_rewards"("participantId");
CREATE INDEX "world_boss_granted_rewards_rewardType_idx" ON "world_boss_granted_rewards"("rewardType");
CREATE INDEX "world_boss_granted_rewards_itemId_idx" ON "world_boss_granted_rewards"("itemId");

-- AddForeignKey
ALTER TABLE "world_bosses" ADD CONSTRAINT "world_bosses_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_boss_events" ADD CONSTRAINT "world_boss_events_worldBossId_fkey" FOREIGN KEY ("worldBossId") REFERENCES "world_bosses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_boss_events" ADD CONSTRAINT "world_boss_events_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_boss_participants" ADD CONSTRAINT "world_boss_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "world_boss_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_boss_participants" ADD CONSTRAINT "world_boss_participants_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_boss_rewards" ADD CONSTRAINT "world_boss_rewards_worldBossId_fkey" FOREIGN KEY ("worldBossId") REFERENCES "world_bosses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_boss_rewards" ADD CONSTRAINT "world_boss_rewards_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "world_boss_granted_rewards" ADD CONSTRAINT "world_boss_granted_rewards_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "world_boss_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_boss_granted_rewards" ADD CONSTRAINT "world_boss_granted_rewards_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
