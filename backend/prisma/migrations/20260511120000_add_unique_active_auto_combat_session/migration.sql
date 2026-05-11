-- Garante que cada personagem tenha no máximo uma sessão de auto-combate ativa.
-- Sessões históricas FINISHED, STOPPED ou DEFEATED continuam permitidas.
CREATE UNIQUE INDEX "auto_combat_sessions_unique_active_character"
ON "auto_combat_sessions" ("characterId")
WHERE "status" = 'ACTIVE';
