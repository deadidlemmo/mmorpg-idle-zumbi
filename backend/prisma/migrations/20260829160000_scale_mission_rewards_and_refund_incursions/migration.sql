-- Mission rewards are snapshots. Active assignments adopt the character's
-- current launch tier; completed and historical assignments keep T1 values.
ALTER TABLE "character_missions"
ADD COLUMN "rewardTier" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rewardXp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "rewardGold" INTEGER NOT NULL DEFAULT 0;

UPDATE "mission_definitions"
SET "rewardGold" = 80,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'daily-field-crafting';

UPDATE "character_missions" AS cm
SET "rewardTier" = CASE
  WHEN cm."status" = 'ACTIVE' THEN LEAST(5, GREATEST(1, CEIL(c."level" / 10.0)::INTEGER))
  ELSE 1
END
FROM "characters" AS c
WHERE c."id" = cm."characterId";

UPDATE "character_missions" AS cm
SET
  "rewardGold" = CASE md."key"
    WHEN 'story-first-supplies' THEN CASE cm."rewardTier" WHEN 1 THEN 40 WHEN 2 THEN 80 WHEN 3 THEN 180 WHEN 4 THEN 320 ELSE 600 END
    WHEN 'daily-clear-threats' THEN CASE cm."rewardTier" WHEN 1 THEN 70 WHEN 2 THEN 140 WHEN 3 THEN 300 WHEN 4 THEN 550 ELSE 950 END
    WHEN 'daily-field-crafting' THEN CASE cm."rewardTier" WHEN 1 THEN 80 WHEN 2 THEN 200 WHEN 3 THEN 650 WHEN 4 THEN 1000 ELSE 2500 END
    WHEN 'daily-incursion-return' THEN CASE cm."rewardTier" WHEN 1 THEN 100 WHEN 2 THEN 180 WHEN 3 THEN 350 WHEN 4 THEN 650 ELSE 1100 END
    WHEN 'weekly-stockpile' THEN CASE cm."rewardTier" WHEN 1 THEN 500 WHEN 2 THEN 1000 WHEN 3 THEN 2200 WHEN 4 THEN 3800 ELSE 7000 END
    ELSE ROUND(md."rewardGold" * CASE cm."rewardTier" WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 4 WHEN 4 THEN 7 ELSE 12 END)::INTEGER
  END,
  "rewardXp" = CASE md."key"
    WHEN 'story-first-supplies' THEN CASE cm."rewardTier" WHEN 1 THEN 80 WHEN 2 THEN 160 WHEN 3 THEN 320 WHEN 4 THEN 560 ELSE 880 END
    WHEN 'daily-clear-threats' THEN CASE cm."rewardTier" WHEN 1 THEN 120 WHEN 2 THEN 240 WHEN 3 THEN 480 WHEN 4 THEN 840 ELSE 1320 END
    WHEN 'daily-field-crafting' THEN CASE cm."rewardTier" WHEN 1 THEN 90 WHEN 2 THEN 180 WHEN 3 THEN 360 WHEN 4 THEN 630 ELSE 990 END
    WHEN 'daily-incursion-return' THEN CASE cm."rewardTier" WHEN 1 THEN 180 WHEN 2 THEN 360 WHEN 3 THEN 720 WHEN 4 THEN 1260 ELSE 1980 END
    WHEN 'weekly-stockpile' THEN CASE cm."rewardTier" WHEN 1 THEN 900 WHEN 2 THEN 1800 WHEN 3 THEN 3600 WHEN 4 THEN 6300 ELSE 9900 END
    ELSE ROUND(md."rewardXp" * CASE cm."rewardTier" WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 4 WHEN 4 THEN 7 ELSE 11 END)::INTEGER
  END
FROM "mission_definitions" AS md
WHERE md."id" = cm."missionId";

ALTER TABLE "character_missions"
ADD CONSTRAINT "character_missions_reward_tier_check"
CHECK ("rewardTier" BETWEEN 1 AND 5);

CREATE INDEX "character_missions_characterId_rewardTier_status_idx"
ON "character_missions"("characterId", "rewardTier", "status");

-- A successful incursion records the entry refund independently from loot.
ALTER TABLE "character_incursion_sessions"
ADD COLUMN "entryGoldRefund" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "character_incursion_sessions"
ADD CONSTRAINT "character_incursion_sessions_entry_refund_check"
CHECK ("entryGoldRefund" >= 0 AND "entryGoldRefund" <= "goldCostPaid");
