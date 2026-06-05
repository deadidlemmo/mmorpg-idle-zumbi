-- AlterTable
ALTER TABLE "auto_combat_sessions"
ADD COLUMN "killProgressSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "estimatedKillTimeSeconds" DOUBLE PRECISION,
ADD COLUMN "baseKillTimeSeconds" DOUBLE PRECISION,
ADD COLUMN "playerOffensivePower" DOUBLE PRECISION,
ADD COLUMN "monsterRecommendedPower" DOUBLE PRECISION,
ADD COLUMN "currentMobIndex" INTEGER;

