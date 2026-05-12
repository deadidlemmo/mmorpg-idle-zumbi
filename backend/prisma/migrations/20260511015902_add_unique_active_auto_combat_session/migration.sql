CREATE UNIQUE INDEX "auto_combat_sessions_unique_active_character"
ON "auto_combat_sessions" ("characterId")
WHERE "status" = 'ACTIVE';