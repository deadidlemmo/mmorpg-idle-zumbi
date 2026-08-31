-- Sessions created before telemetry snapshots cannot be used for cohort
-- analysis. Keep their gameplay history, but remove partial timing collected
-- after the telemetry deployment.
UPDATE "auto_combat_sessions"
SET "huntingDurationMs" = 0,
    "combatDurationMs" = 0
WHERE "characterLevelSnapshot" IS NULL;
