-- Tracks how many times each mob was found during the hunt phase.
ALTER TABLE "auto_combat_session_mob_summaries"
ADD COLUMN "foundCount" INTEGER NOT NULL DEFAULT 0;
