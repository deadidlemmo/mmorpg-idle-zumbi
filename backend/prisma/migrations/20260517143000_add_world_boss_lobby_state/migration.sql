-- Add a lobby phase before World Boss battles and track voluntary exits.
ALTER TYPE "WorldBossEventStatus" ADD VALUE IF NOT EXISTS 'LOBBY_OPEN';

ALTER TABLE "world_boss_participants" ADD COLUMN IF NOT EXISTS "leftAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "world_boss_participants_leftAt_idx" ON "world_boss_participants"("leftAt");
