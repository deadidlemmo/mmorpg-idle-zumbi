-- Novas recompensas de fragmentos passam a ser itens de inventário negociáveis.
-- Os saldos antigos em character_economy_balances permanecem intactos e serão
-- consumidos gradualmente pela incubadora antes dos itens físicos.
UPDATE "world_boss_rewards" AS reward
SET
  "rewardType" = 'MATERIAL',
  "itemId" = fragment."id",
  "currency" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "world_bosses" AS boss,
     "items" AS fragment
WHERE reward."worldBossId" = boss."id"
  AND fragment."slug" = 'fragmento-de-ameaca-t' || boss."tier"::TEXT
  AND reward."currency" = 'WORLD_BOSS_FRAGMENT';

UPDATE "items"
SET
  "isSellable" = FALSE,
  "isTradable" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" ~ '^fragmento-de-ameaca-t(10|[1-9])$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "world_boss_rewards"
    WHERE "currency" = 'WORLD_BOSS_FRAGMENT'
  ) THEN
    RAISE EXCEPTION 'Ainda existem recompensas de fragmentos configuradas como saldo.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "world_bosses" AS boss
    WHERE boss."isActive" = TRUE
      AND boss."tier" BETWEEN 1 AND 10
      AND NOT EXISTS (
        SELECT 1
        FROM "world_boss_rewards" AS reward
        JOIN "items" AS fragment ON fragment."id" = reward."itemId"
        WHERE reward."worldBossId" = boss."id"
          AND reward."rewardType" = 'MATERIAL'
          AND fragment."slug" = 'fragmento-de-ameaca-t' || boss."tier"::TEXT
      )
  ) THEN
    RAISE EXCEPTION 'Há Ameaça Global ativa sem fragmento físico do próprio tier.';
  END IF;
END $$;
