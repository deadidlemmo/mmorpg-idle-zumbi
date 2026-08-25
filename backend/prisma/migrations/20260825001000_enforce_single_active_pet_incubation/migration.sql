-- A character has a single incubator slot. The partial unique index keeps
-- concurrent requests from creating more than one active incubation.
CREATE UNIQUE INDEX "character_pets_one_active_incubation_per_character_key"
ON "character_pets"("characterId")
WHERE "status" = 'INCUBATING';
