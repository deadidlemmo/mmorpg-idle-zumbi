UPDATE "mission_definitions"
SET "rewardGold" = 110,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'daily-field-crafting';

UPDATE "character_missions" AS cm
SET "rewardGold" = CASE cm."rewardTier"
  WHEN 1 THEN 110
  WHEN 2 THEN 900
  WHEN 3 THEN 3200
  WHEN 4 THEN 5000
  ELSE 13000
END
FROM "mission_definitions" AS md
WHERE md."id" = cm."missionId"
  AND md."key" = 'daily-field-crafting'
  AND cm."claimedAt" IS NULL
  AND cm."status" IN ('ACTIVE', 'COMPLETED');
