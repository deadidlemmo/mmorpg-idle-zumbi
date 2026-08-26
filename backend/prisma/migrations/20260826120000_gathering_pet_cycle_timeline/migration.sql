ALTER TABLE "gathering_sessions"
ADD COLUMN "cycleStartedAt" TIMESTAMP(3),
ADD COLUMN "cycleEndsAt" TIMESTAMP(3),
ADD COLUMN "cycleDurationMs" INTEGER,
ADD COLUMN "cycleVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "appliedPetDefinitionId" TEXT,
ADD COLUMN "appliedPetEffectBasisPoints" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "gathering_sessions"
ADD CONSTRAINT "gathering_sessions_cycle_version_check"
CHECK ("cycleVersion" >= 1),
ADD CONSTRAINT "gathering_sessions_cycle_duration_check"
CHECK ("cycleDurationMs" IS NULL OR "cycleDurationMs" > 0),
ADD CONSTRAINT "gathering_sessions_pet_effect_basis_points_check"
CHECK (
  "appliedPetEffectBasisPoints" >= 0
  AND "appliedPetEffectBasisPoints" < 10000
),
ADD CONSTRAINT "gathering_sessions_cycle_timeline_complete_check"
CHECK (
  ("cycleStartedAt" IS NULL AND "cycleEndsAt" IS NULL AND "cycleDurationMs" IS NULL)
  OR
  ("cycleStartedAt" IS NOT NULL AND "cycleEndsAt" IS NOT NULL AND "cycleDurationMs" IS NOT NULL)
);
