-- Add configurable timed incursions, loot tables and character currency balances.

CREATE TYPE "IncursionDifficulty" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'EXTREME');
CREATE TYPE "IncursionRewardType" AS ENUM ('XP', 'GOLD', 'MATERIAL', 'CONSUMABLE', 'EQUIPMENT', 'ITEM');
CREATE TYPE "IncursionSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLAIMED', 'FAILED', 'CANCELLED');

ALTER TABLE "characters"
  ADD COLUMN "gold" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cash" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "incursions" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "mapId" TEXT NOT NULL,
  "tier" INTEGER NOT NULL,
  "minLevel" INTEGER NOT NULL,
  "maxLevel" INTEGER NOT NULL,
  "goldCost" INTEGER NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "difficulty" "IncursionDifficulty" NOT NULL DEFAULT 'LOW',
  "riskLevel" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "incursions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incursion_loot_tables" (
  "id" TEXT NOT NULL,
  "incursionId" TEXT NOT NULL,
  "rewardType" "IncursionRewardType" NOT NULL,
  "itemId" TEXT,
  "chance" INTEGER NOT NULL DEFAULT 100,
  "minQuantity" INTEGER NOT NULL DEFAULT 1,
  "maxQuantity" INTEGER NOT NULL DEFAULT 1,
  "guaranteed" BOOLEAN NOT NULL DEFAULT false,
  "rarity" "Rarity",
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "incursion_loot_tables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "character_incursion_sessions" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "incursionId" TEXT NOT NULL,
  "status" "IncursionSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "goldCostPaid" INTEGER NOT NULL DEFAULT 0,
  "xpReward" INTEGER NOT NULL DEFAULT 0,
  "goldReward" INTEGER NOT NULL DEFAULT 0,
  "generatedRewardsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "character_incursion_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incursion_session_rewards" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "rewardType" "IncursionRewardType" NOT NULL,
  "itemId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "rarity" "Rarity",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "incursion_session_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "incursions_slug_key" ON "incursions"("slug");
CREATE INDEX "incursions_mapId_idx" ON "incursions"("mapId");
CREATE INDEX "incursions_tier_idx" ON "incursions"("tier");
CREATE INDEX "incursions_minLevel_maxLevel_idx" ON "incursions"("minLevel", "maxLevel");
CREATE INDEX "incursions_isActive_idx" ON "incursions"("isActive");
CREATE INDEX "incursions_sortOrder_idx" ON "incursions"("sortOrder");

CREATE INDEX "incursion_loot_tables_incursionId_idx" ON "incursion_loot_tables"("incursionId");
CREATE INDEX "incursion_loot_tables_rewardType_idx" ON "incursion_loot_tables"("rewardType");
CREATE INDEX "incursion_loot_tables_itemId_idx" ON "incursion_loot_tables"("itemId");
CREATE INDEX "incursion_loot_tables_sortOrder_idx" ON "incursion_loot_tables"("sortOrder");

CREATE INDEX "character_incursion_sessions_characterId_idx" ON "character_incursion_sessions"("characterId");
CREATE INDEX "character_incursion_sessions_incursionId_idx" ON "character_incursion_sessions"("incursionId");
CREATE INDEX "character_incursion_sessions_status_idx" ON "character_incursion_sessions"("status");
CREATE INDEX "character_incursion_sessions_characterId_status_idx" ON "character_incursion_sessions"("characterId", "status");
CREATE INDEX "character_incursion_sessions_startedAt_idx" ON "character_incursion_sessions"("startedAt");
CREATE INDEX "character_incursion_sessions_endsAt_idx" ON "character_incursion_sessions"("endsAt");
CREATE UNIQUE INDEX "character_incursion_sessions_one_active_idx"
  ON "character_incursion_sessions"("characterId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "incursion_session_rewards_sessionId_idx" ON "incursion_session_rewards"("sessionId");
CREATE INDEX "incursion_session_rewards_rewardType_idx" ON "incursion_session_rewards"("rewardType");
CREATE INDEX "incursion_session_rewards_itemId_idx" ON "incursion_session_rewards"("itemId");

ALTER TABLE "incursions" ADD CONSTRAINT "incursions_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incursion_loot_tables" ADD CONSTRAINT "incursion_loot_tables_incursionId_fkey" FOREIGN KEY ("incursionId") REFERENCES "incursions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incursion_loot_tables" ADD CONSTRAINT "incursion_loot_tables_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "character_incursion_sessions" ADD CONSTRAINT "character_incursion_sessions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_incursion_sessions" ADD CONSTRAINT "character_incursion_sessions_incursionId_fkey" FOREIGN KEY ("incursionId") REFERENCES "incursions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incursion_session_rewards" ADD CONSTRAINT "incursion_session_rewards_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "character_incursion_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incursion_session_rewards" ADD CONSTRAINT "incursion_session_rewards_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
