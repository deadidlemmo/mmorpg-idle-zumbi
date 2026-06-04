-- Makes AutoCombatSession map-first while preserving the legacy subMap anchor.
ALTER TABLE "auto_combat_sessions"
ADD COLUMN "mapId" TEXT;

UPDATE "auto_combat_sessions" acs
SET "mapId" = sm."mapId"
FROM "sub_maps" sm
WHERE acs."subMapId" = sm."id"
  AND acs."mapId" IS NULL;

ALTER TABLE "auto_combat_sessions"
ALTER COLUMN "mapId" SET NOT NULL;

CREATE INDEX "auto_combat_sessions_mapId_idx"
ON "auto_combat_sessions"("mapId");

ALTER TABLE "auto_combat_sessions"
ADD CONSTRAINT "auto_combat_sessions_mapId_fkey"
FOREIGN KEY ("mapId") REFERENCES "game_maps"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
