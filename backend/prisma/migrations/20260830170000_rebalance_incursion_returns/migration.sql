-- Incursões T1-T5 mantêm fichas e fragmentos atuais, mas deixam de impor
-- uma perda excessiva de progressão. O XP abaixo mira cerca de 65% do
-- autocombate representativo na abordagem BALANCED.
UPDATE "incursion_loot_tables" AS loot
SET
  "minQuantity" = balance.xp,
  "maxQuantity" = balance.xp,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "incursions" AS incursion
JOIN (
  VALUES
    (1, 0, 650),
    (1, 1, 690),
    (2, 0, 630),
    (2, 1, 760),
    (3, 0, 910),
    (3, 1, 1220),
    (4, 0, 1350),
    (4, 1, 1740),
    (5, 0, 2440),
    (5, 1, 3280)
) AS balance(tier, variant, xp)
  ON balance.tier = incursion."tier"
 AND balance.variant = MOD(incursion."sortOrder", 10)
WHERE loot."incursionId" = incursion."id"
  AND loot."rewardType" = 'XP'::"IncursionRewardType";

-- O prêmio de Gold continua pequeno diante do autocombate, mas passa a ser
-- garantido quando a incursão termina com sucesso.
UPDATE "incursion_loot_tables" AS loot
SET
  "chance" = 100,
  "guaranteed" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "incursions" AS incursion
WHERE loot."incursionId" = incursion."id"
  AND incursion."tier" BETWEEN 1 AND 5
  AND loot."rewardType" = 'GOLD'::"IncursionRewardType";
