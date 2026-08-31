-- Fichas e fragmentos deixam de ser saldos abstratos. A mochila passa a ser a
-- única fonte de verdade para posse, troca e negociação desses recursos.

WITH token_items("id", "tier", "name", "slug", "rarity") AS (
  VALUES
    ('81000000-0000-4000-8000-000000000001', 1, 'Ficha de Incursão T1', 'ficha-de-incursao-t1', 'COMMON'::"Rarity"),
    ('81000000-0000-4000-8000-000000000002', 2, 'Ficha de Incursão T2', 'ficha-de-incursao-t2', 'COMMON'::"Rarity"),
    ('81000000-0000-4000-8000-000000000003', 3, 'Ficha de Incursão T3', 'ficha-de-incursao-t3', 'UNCOMMON'::"Rarity"),
    ('81000000-0000-4000-8000-000000000004', 4, 'Ficha de Incursão T4', 'ficha-de-incursao-t4', 'UNCOMMON'::"Rarity"),
    ('81000000-0000-4000-8000-000000000005', 5, 'Ficha de Incursão T5', 'ficha-de-incursao-t5', 'RARE'::"Rarity"),
    ('81000000-0000-4000-8000-000000000006', 6, 'Ficha de Incursão T6', 'ficha-de-incursao-t6', 'RARE'::"Rarity"),
    ('81000000-0000-4000-8000-000000000007', 7, 'Ficha de Incursão T7', 'ficha-de-incursao-t7', 'EPIC'::"Rarity"),
    ('81000000-0000-4000-8000-000000000008', 8, 'Ficha de Incursão T8', 'ficha-de-incursao-t8', 'EPIC'::"Rarity"),
    ('81000000-0000-4000-8000-000000000009', 9, 'Ficha de Incursão T9', 'ficha-de-incursao-t9', 'LEGENDARY'::"Rarity"),
    ('81000000-0000-4000-8000-000000000010', 10, 'Ficha de Incursão T10', 'ficha-de-incursao-t10', 'LEGENDARY'::"Rarity")
)
INSERT INTO "items" (
  "id",
  "name",
  "description",
  "tier",
  "rarity",
  "slot",
  "family",
  "slug",
  "isGatheringMaterial",
  "requiredGatheringLevel",
  "gatheringXpPerUnit",
  "isSellable",
  "isTradable",
  "isCraftable",
  "enhancementLevel",
  "createdAt",
  "updatedAt"
)
SELECT
  token."id",
  token."name",
  'Ficha operacional T' || token."tier" || ' obtida em incursões. Pode ser trocada por recursos do mesmo tier pela mochila.',
  token."tier",
  token."rarity",
  'MATERIAL'::"ItemSlot",
  'Ficha de Incursão',
  token."slug",
  FALSE,
  1,
  0,
  FALSE,
  FALSE,
  FALSE,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM token_items AS token
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description",
  "tier" = EXCLUDED."tier",
  "rarity" = EXCLUDED."rarity",
  "slot" = EXCLUDED."slot",
  "family" = EXCLUDED."family",
  "slug" = EXCLUDED."slug",
  "isGatheringMaterial" = FALSE,
  "gatheringXpPerUnit" = 0,
  "isSellable" = FALSE,
  "isTradable" = FALSE,
  "isCraftable" = FALSE,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "items"
SET
  "isSellable" = FALSE,
  "isTradable" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" ~ '^fragmento-de-ameaca-t(10|[1-9])$';

UPDATE "incursion_loot_tables" AS reward
SET
  "rewardType" = 'MATERIAL',
  "itemId" = token."id",
  "currency" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "incursions" AS incursion,
     "items" AS token
WHERE reward."incursionId" = incursion."id"
  AND token."slug" = 'ficha-de-incursao-t' || incursion."tier"::TEXT
  AND reward."currency" = 'INCURSION_TOKEN';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "character_economy_balances"
    WHERE "balance" < 0
  ) THEN
    RAISE EXCEPTION 'Há saldo econômico legado negativo; migração interrompida.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "character_economy_balances" AS balance
    WHERE balance."balance" > 0
      AND NOT EXISTS (
        SELECT 1
        FROM "items" AS item
        WHERE item."slug" = CASE balance."currency"
          WHEN 'INCURSION_TOKEN' THEN 'ficha-de-incursao-t' || balance."tier"::TEXT
          WHEN 'WORLD_BOSS_FRAGMENT' THEN 'fragmento-de-ameaca-t' || balance."tier"::TEXT
        END
      )
  ) THEN
    RAISE EXCEPTION 'Há saldo econômico legado sem item físico correspondente.';
  END IF;
END $$;

WITH balances AS (
  SELECT
    balance."id",
    balance."characterId",
    balance."currency",
    balance."tier",
    balance."balance",
    item."id" AS "itemId"
  FROM "character_economy_balances" AS balance
  JOIN "items" AS item
    ON item."slug" = CASE balance."currency"
      WHEN 'INCURSION_TOKEN' THEN 'ficha-de-incursao-t' || balance."tier"::TEXT
      WHEN 'WORLD_BOSS_FRAGMENT' THEN 'fragmento-de-ameaca-t' || balance."tier"::TEXT
    END
  WHERE balance."balance" > 0
)
INSERT INTO "inventory_items" (
  "id",
  "characterId",
  "itemId",
  "type",
  "quantity",
  "createdAt",
  "updatedAt"
)
SELECT
  SUBSTRING(MD5('physical-economy-item:' || balances."id"), 1, 8) || '-' ||
  SUBSTRING(MD5('physical-economy-item:' || balances."id"), 9, 4) || '-4' ||
  SUBSTRING(MD5('physical-economy-item:' || balances."id"), 14, 3) || '-8' ||
  SUBSTRING(MD5('physical-economy-item:' || balances."id"), 18, 3) || '-' ||
  SUBSTRING(MD5('physical-economy-item:' || balances."id"), 21, 12),
  balances."characterId",
  balances."itemId",
  'MATERIAL'::"InventoryItemType",
  balances."balance",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM balances
ON CONFLICT ("characterId", "itemId") DO UPDATE SET
  "quantity" = "inventory_items"."quantity" + EXCLUDED."quantity",
  "type" = 'MATERIAL'::"InventoryItemType",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH balances AS (
  SELECT
    balance."id",
    balance."characterId",
    balance."currency",
    balance."tier",
    balance."balance",
    item."id" AS "itemId",
    inventory."quantity" AS "balanceAfter"
  FROM "character_economy_balances" AS balance
  JOIN "items" AS item
    ON item."slug" = CASE balance."currency"
      WHEN 'INCURSION_TOKEN' THEN 'ficha-de-incursao-t' || balance."tier"::TEXT
      WHEN 'WORLD_BOSS_FRAGMENT' THEN 'fragmento-de-ameaca-t' || balance."tier"::TEXT
    END
  JOIN "inventory_items" AS inventory
    ON inventory."characterId" = balance."characterId"
   AND inventory."itemId" = item."id"
  WHERE balance."balance" > 0
)
INSERT INTO "economy_ledger_entries" (
  "id",
  "characterId",
  "itemId",
  "direction",
  "resourceType",
  "currency",
  "tier",
  "quantity",
  "balanceAfter",
  "reason",
  "referenceType",
  "referenceId",
  "idempotencyKey",
  "metadata",
  "createdAt"
)
SELECT
  SUBSTRING(MD5('physical-economy-ledger:' || balances."id"), 1, 8) || '-' ||
  SUBSTRING(MD5('physical-economy-ledger:' || balances."id"), 9, 4) || '-4' ||
  SUBSTRING(MD5('physical-economy-ledger:' || balances."id"), 14, 3) || '-8' ||
  SUBSTRING(MD5('physical-economy-ledger:' || balances."id"), 18, 3) || '-' ||
  SUBSTRING(MD5('physical-economy-ledger:' || balances."id"), 21, 12),
  balances."characterId",
  balances."itemId",
  'CREDIT'::"EconomyDirection",
  'ITEM'::"EconomyResourceType",
  NULL,
  balances."tier",
  balances."balance",
  balances."balanceAfter",
  'LEGACY_CURRENCY_MIGRATED_TO_ITEM',
  'CharacterEconomyBalance',
  balances."id",
  'legacy-currency-to-item:' || balances."id",
  JSONB_BUILD_OBJECT(
    'legacyCurrency', balances."currency",
    'legacyQuantity', balances."balance"
  ),
  CURRENT_TIMESTAMP
FROM balances
ON CONFLICT ("idempotencyKey") DO NOTHING;

DELETE FROM "character_economy_balances";

ALTER TABLE "character_economy_balances"
ADD CONSTRAINT "character_economy_balances_legacy_zero_check"
CHECK ("balance" = 0);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "character_economy_balances") THEN
    RAISE EXCEPTION 'A carteira econômica legada não foi esvaziada.';
  END IF;

  IF (SELECT COUNT(*) FROM "items" WHERE "slug" ~ '^ficha-de-incursao-t(10|[1-9])$') <> 10 THEN
    RAISE EXCEPTION 'As dez fichas físicas de incursão não foram criadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "incursion_loot_tables"
    WHERE "currency" = 'INCURSION_TOKEN'
  ) THEN
    RAISE EXCEPTION 'Ainda existem recompensas de incursão configuradas como saldo.';
  END IF;
END $$;
