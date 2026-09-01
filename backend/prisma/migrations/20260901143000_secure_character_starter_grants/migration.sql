ALTER TABLE "users"
ADD COLUMN "starterGoldGrantedAt" TIMESTAMP(3);

UPDATE "users" AS "user"
SET "starterGoldGrantedAt" = "history"."firstCharacterAt"
FROM (
  SELECT "userId", MIN("createdAt") AS "firstCharacterAt"
  FROM "characters"
  GROUP BY "userId"
) AS "history"
WHERE "history"."userId" = "user"."id";

UPDATE "items"
SET
  "isSellable" = false,
  "isTradable" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "tier" = 0
  AND "slot" IN (
    'MAIN_HAND',
    'OFF_HAND',
    'HEAD',
    'ARMOR',
    'PANTS',
    'BOOTS'
  );
