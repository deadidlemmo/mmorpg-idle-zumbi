-- Freeze the state used by each auto-combat session so progression and
-- economy reports can be segmented without reading mutable character data.
ALTER TABLE "auto_combat_sessions"
ADD COLUMN "characterLevelSnapshot" INTEGER,
ADD COLUMN "classIdSnapshot" TEXT,
ADD COLUMN "classNameSnapshot" TEXT,
ADD COLUMN "equipmentSnapshot" JSONB,
ADD COLUMN "huntingSnapshot" JSONB,
ADD COLUMN "petSnapshot" JSONB,
ADD COLUMN "premiumSnapshot" BOOLEAN,
ADD COLUMN "premiumUntilSnapshot" TIMESTAMP(3),
ADD COLUMN "huntingDurationMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "combatDurationMs" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "auto_combat_sessions"
ADD CONSTRAINT "auto_combat_sessions_telemetry_snapshot_check"
CHECK (
  ("characterLevelSnapshot" IS NULL OR "characterLevelSnapshot" >= 1)
  AND "huntingDurationMs" >= 0
  AND "combatDurationMs" >= 0
);

CREATE INDEX "auto_combat_sessions_characterLevelSnapshot_classNameSnapshot_idx"
ON "auto_combat_sessions"("characterLevelSnapshot", "classNameSnapshot");

-- A boss win always grants meaningful fragment progress. The cocoon remains
-- random and has no pity mechanic; winning it does not remove the fragments.
UPDATE "world_boss_rewards" AS reward
SET "minQuantity" = CASE boss."tier"
  WHEN 1 THEN 2
  WHEN 2 THEN 3
  WHEN 3 THEN 4
  WHEN 4 THEN 5
  ELSE 6
END,
"maxQuantity" = CASE boss."tier"
  WHEN 1 THEN 3
  WHEN 2 THEN 4
  WHEN 3 THEN 5
  WHEN 4 THEN 6
  ELSE 7
END,
"chance" = 100,
"guaranteed" = TRUE,
"requiresMinParticipation" = TRUE,
"updatedAt" = CURRENT_TIMESTAMP
FROM "world_bosses" AS boss
WHERE reward."worldBossId" = boss."id"
  AND reward."rewardType" = 'CURRENCY'
  AND reward."currency" = 'WORLD_BOSS_FRAGMENT'
  AND boss."tier" BETWEEN 1 AND 5;

UPDATE "world_boss_rewards" AS reward
SET "chance" = CASE boss."tier"
  WHEN 1 THEN 18
  WHEN 2 THEN 16
  WHEN 3 THEN 14
  WHEN 4 THEN 12
  ELSE 10
END,
"guaranteed" = FALSE,
"onlyIfDefeated" = TRUE,
"requiresMinParticipation" = TRUE,
"updatedAt" = CURRENT_TIMESTAMP
FROM "world_bosses" AS boss
WHERE reward."worldBossId" = boss."id"
  AND reward."rewardType" = 'PET_EGG'
  AND boss."tier" BETWEEN 1 AND 5;
