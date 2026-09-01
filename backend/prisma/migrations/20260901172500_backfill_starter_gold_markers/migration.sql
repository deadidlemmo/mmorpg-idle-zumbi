UPDATE "users" AS "user"
SET "starterGoldGrantedAt" = "history"."firstCharacterAt"
FROM (
  SELECT "userId", MIN("createdAt") AS "firstCharacterAt"
  FROM "characters"
  GROUP BY "userId"
) AS "history"
WHERE
  "history"."userId" = "user"."id"
  AND "user"."starterGoldGrantedAt" IS NULL;
