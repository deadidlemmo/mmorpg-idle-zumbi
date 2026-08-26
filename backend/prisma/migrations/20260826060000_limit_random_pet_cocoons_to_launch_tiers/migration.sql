-- Specialized pet cocoons are part of the T1-T5 launch economy. Future tiers
-- keep their existing generic cocoon reward until their catalog is defined.
UPDATE "world_boss_rewards" AS reward
SET
  "randomPetCocoon" = false,
  "itemId" = COALESCE(reward."itemId", item."id")
FROM "world_bosses" AS boss
LEFT JOIN "items" AS item
  ON item."slug" = CONCAT('casulo-infectado-t', boss."tier")
WHERE reward."worldBossId" = boss."id"
  AND reward."rewardType" = 'PET_EGG'
  AND boss."tier" NOT BETWEEN 1 AND 5;
