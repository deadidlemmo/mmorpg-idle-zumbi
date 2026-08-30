-- Registration is non-blocking. Only confirmed players occupy the lobby and
-- participate in the combat snapshot.
ALTER TABLE "world_boss_events"
ADD COLUMN "registrationCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "world_boss_participants"
ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Existing participants that had already reached a real lobby or battle keep
-- their participation. Scheduled rows become advance registrations.
UPDATE "world_boss_participants" AS participant
SET "confirmedAt" = COALESCE(participant."combatSnapshotAt", participant."joinedAt")
FROM "world_boss_events" AS event
WHERE participant."eventId" = event."id"
  AND participant."leftAt" IS NULL
  AND event."status" IN (
    'LOBBY_OPEN'::"WorldBossEventStatus",
    'ACTIVE'::"WorldBossEventStatus",
    'DEFEATED'::"WorldBossEventStatus",
    'EXPIRED'::"WorldBossEventStatus",
    'REWARDED'::"WorldBossEventStatus"
  );

UPDATE "world_boss_events" AS event
SET "registrationCount" = (
  SELECT COUNT(*)::INTEGER
  FROM "world_boss_participants" AS participant
  WHERE participant."eventId" = event."id"
    AND participant."leftAt" IS NULL
),
"participantCount" = (
  SELECT COUNT(*)::INTEGER
  FROM "world_boss_participants" AS participant
  WHERE participant."eventId" = event."id"
    AND participant."leftAt" IS NULL
    AND participant."confirmedAt" IS NOT NULL
);

ALTER TABLE "world_boss_events"
ADD CONSTRAINT "world_boss_events_registration_count_check"
CHECK (
  "registrationCount" >= 0
  AND "participantCount" >= 0
  AND "participantCount" <= "registrationCount"
);

CREATE INDEX "world_boss_participants_eventId_confirmedAt_leftAt_idx"
ON "world_boss_participants"("eventId", "confirmedAt", "leftAt");
