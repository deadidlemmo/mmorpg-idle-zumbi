CREATE TYPE "AutoCombatSessionPhase" AS ENUM ('HUNTING', 'ENCOUNTER_READY', 'COMBAT_ACTIVE');

CREATE TABLE "character_hunting_skills" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_hunting_skills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "character_hunting_skills_characterId_key" ON "character_hunting_skills"("characterId");

CREATE INDEX "character_hunting_skills_characterId_idx" ON "character_hunting_skills"("characterId");

CREATE INDEX "character_hunting_skills_level_idx" ON "character_hunting_skills"("level");

ALTER TABLE "character_hunting_skills"
ADD CONSTRAINT "character_hunting_skills_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_combat_sessions"
ADD COLUMN "phase" "AutoCombatSessionPhase" NOT NULL DEFAULT 'COMBAT_ACTIVE',
ADD COLUMN "huntStartedAt" TIMESTAMP(3),
ADD COLUMN "huntStoppedAt" TIMESTAMP(3),
ADD COLUMN "lastHuntProcessedAt" TIMESTAMP(3),
ADD COLUMN "huntingLevelAtStart" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "huntingXpGained" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "foundEnemiesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "bonusEnemiesFound" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "selectedEncounterId" TEXT,
ADD COLUMN "selectedEncounterMobId" TEXT;

CREATE INDEX "auto_combat_sessions_selectedEncounterId_idx" ON "auto_combat_sessions"("selectedEncounterId");

CREATE INDEX "auto_combat_sessions_phase_idx" ON "auto_combat_sessions"("phase");

CREATE INDEX "auto_combat_sessions_characterId_status_phase_idx" ON "auto_combat_sessions"("characterId", "status", "phase");

ALTER TABLE "auto_combat_sessions"
ADD CONSTRAINT "auto_combat_sessions_selectedEncounterId_fkey"
FOREIGN KEY ("selectedEncounterId") REFERENCES "sub_map_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
