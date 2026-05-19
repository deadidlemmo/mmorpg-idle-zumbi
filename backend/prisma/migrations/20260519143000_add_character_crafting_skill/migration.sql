CREATE TABLE "character_crafting_skills" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_crafting_skills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "character_crafting_skills_characterId_key" ON "character_crafting_skills"("characterId");

CREATE INDEX "character_crafting_skills_characterId_idx" ON "character_crafting_skills"("characterId");

CREATE INDEX "character_crafting_skills_level_idx" ON "character_crafting_skills"("level");

ALTER TABLE "character_crafting_skills"
ADD CONSTRAINT "character_crafting_skills_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
