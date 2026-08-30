-- Freeze each participant's combat power when the battle starts and let the
-- backend advance aggregate damage without depending on client polling.
ALTER TABLE "world_boss_events"
ADD COLUMN "targetTtkSeconds" INTEGER,
ADD COLUMN "aggregateDamagePerSecond" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "aggregateScalingDamagePerSecond" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "damageProcessedAt" TIMESTAMP(3),
ADD COLUMN "scalingVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "world_boss_participants"
ADD COLUMN "powerScoreSnapshot" INTEGER,
ADD COLUMN "damagePerSecondSnapshot" DOUBLE PRECISION,
ADD COLUMN "scalingDamagePerSecondSnapshot" DOUBLE PRECISION,
ADD COLUMN "readinessSnapshot" DOUBLE PRECISION,
ADD COLUMN "equipmentTierSnapshot" DOUBLE PRECISION,
ADD COLUMN "equippedPieceCountSnapshot" INTEGER,
ADD COLUMN "damageRemainder" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "combatSnapshotAt" TIMESTAMP(3);

ALTER TABLE "world_boss_events"
ADD CONSTRAINT "world_boss_events_target_ttk_check"
CHECK ("targetTtkSeconds" IS NULL OR "targetTtkSeconds" > 0),
ADD CONSTRAINT "world_boss_events_damage_rate_check"
CHECK (
  "aggregateDamagePerSecond" >= 0
  AND "aggregateScalingDamagePerSecond" >= 0
),
ADD CONSTRAINT "world_boss_events_scaling_version_check"
CHECK ("scalingVersion" >= 1);

ALTER TABLE "world_boss_participants"
ADD CONSTRAINT "world_boss_participants_snapshot_check"
CHECK (
  ("powerScoreSnapshot" IS NULL OR "powerScoreSnapshot" > 0)
  AND ("damagePerSecondSnapshot" IS NULL OR "damagePerSecondSnapshot" >= 0)
  AND (
    "scalingDamagePerSecondSnapshot" IS NULL
    OR "scalingDamagePerSecondSnapshot" >= 0
  )
  AND ("readinessSnapshot" IS NULL OR "readinessSnapshot" > 0)
  AND ("equipmentTierSnapshot" IS NULL OR "equipmentTierSnapshot" >= 0)
  AND (
    "equippedPieceCountSnapshot" IS NULL
    OR "equippedPieceCountSnapshot" BETWEEN 0 AND 6
  )
  AND "damageRemainder" >= 0
  AND "damageRemainder" < 1
);

CREATE INDEX "world_boss_events_status_damageProcessedAt_idx"
ON "world_boss_events"("status", "damageProcessedAt");

-- Match the launch pet rarity contract: T1-T2 common, T3-T4 uncommon, T5 rare.
UPDATE "items"
SET "rarity" = CASE
  WHEN "tier" <= 2 THEN 'COMMON'::"Rarity"
  WHEN "tier" <= 4 THEN 'UNCOMMON'::"Rarity"
  ELSE 'RARE'::"Rarity"
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "family" = 'Casulo Infectado'
  AND "tier" BETWEEN 1 AND 5;

-- A cocoon is never guaranteed, but its chance is high enough to remain a
-- realistic boss drop. Fragments remain guaranteed even when the cocoon drops.
UPDATE "world_boss_rewards" AS reward
SET "chance" = CASE boss."tier"
  WHEN 1 THEN 7
  WHEN 2 THEN 7
  WHEN 3 THEN 5
  WHEN 4 THEN 5
  ELSE 4
END,
"rarity" = CASE
  WHEN boss."tier" <= 2 THEN 'COMMON'::"Rarity"
  WHEN boss."tier" <= 4 THEN 'UNCOMMON'::"Rarity"
  ELSE 'RARE'::"Rarity"
END,
"guaranteed" = FALSE,
"onlyIfDefeated" = TRUE,
"requiresMinParticipation" = TRUE,
"updatedAt" = CURRENT_TIMESTAMP
FROM "world_bosses" AS boss
WHERE reward."worldBossId" = boss."id"
  AND reward."rewardType" = 'PET_EGG'
  AND boss."tier" BETWEEN 1 AND 5;

UPDATE "world_boss_rewards" AS reward
SET "minQuantity" = 1,
"maxQuantity" = CASE WHEN boss."tier" <= 2 THEN 1 ELSE 2 END,
"chance" = 100,
"guaranteed" = TRUE,
"requiresMinParticipation" = TRUE,
"updatedAt" = CURRENT_TIMESTAMP
FROM "world_bosses" AS boss
WHERE reward."worldBossId" = boss."id"
  AND reward."rewardType" = 'CURRENCY'
  AND reward."currency" = 'WORLD_BOSS_FRAGMENT'
  AND boss."tier" BETWEEN 1 AND 5;
