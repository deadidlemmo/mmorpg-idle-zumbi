WITH "ranked_active_sessions" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "characterId"
      ORDER BY "startedAt" DESC, "id" DESC
    ) AS "active_rank"
  FROM "gathering_sessions"
  WHERE "status" = 'ACTIVE'
)
UPDATE "gathering_sessions" AS "session"
SET
  "status" = 'STOPPED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ranked_active_sessions" AS "ranked"
WHERE
  "session"."id" = "ranked"."id"
  AND "ranked"."active_rank" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "gathering_sessions_one_active_per_character_idx"
ON "gathering_sessions"("characterId")
WHERE "status" = 'ACTIVE';
