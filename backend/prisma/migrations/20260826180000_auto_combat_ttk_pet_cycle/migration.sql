ALTER TABLE "auto_combat_sessions"
ADD COLUMN "killProgressMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "estimatedKillTimeMs" INTEGER,
ADD COLUMN "unmodifiedKillTimeMs" INTEGER,
ADD COLUMN "appliedTtkPetDefinitionId" TEXT,
ADD COLUMN "appliedTtkPetEffectBasisPoints" INTEGER NOT NULL DEFAULT 0;

UPDATE "auto_combat_sessions"
SET
  "killProgressMs" = GREATEST(0, ROUND("killProgressSeconds" * 1000)::INTEGER),
  "estimatedKillTimeMs" = CASE
    WHEN "estimatedKillTimeSeconds" IS NULL THEN NULL
    ELSE GREATEST(1000, ROUND("estimatedKillTimeSeconds" * 1000)::INTEGER)
  END,
  "unmodifiedKillTimeMs" = CASE
    WHEN "estimatedKillTimeSeconds" IS NULL THEN NULL
    ELSE GREATEST(1000, ROUND("estimatedKillTimeSeconds" * 1000)::INTEGER)
  END;

ALTER TABLE "auto_combat_sessions"
ADD CONSTRAINT "auto_combat_sessions_kill_progress_ms_check"
CHECK ("killProgressMs" >= 0),
ADD CONSTRAINT "auto_combat_sessions_estimated_kill_time_ms_check"
CHECK ("estimatedKillTimeMs" IS NULL OR "estimatedKillTimeMs" >= 1000),
ADD CONSTRAINT "auto_combat_sessions_unmodified_kill_time_ms_check"
CHECK ("unmodifiedKillTimeMs" IS NULL OR "unmodifiedKillTimeMs" >= 1000),
ADD CONSTRAINT "auto_combat_sessions_ttk_pet_effect_basis_points_check"
CHECK (
  "appliedTtkPetEffectBasisPoints" >= 0
  AND "appliedTtkPetEffectBasisPoints" < 10000
);
