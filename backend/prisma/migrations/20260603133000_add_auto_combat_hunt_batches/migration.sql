-- Persists hunt/tracking batches independently from combat execution state.
CREATE TYPE "AutoCombatHuntBatchStatus" AS ENUM ('HUNTING', 'READY', 'CONSUMED', 'CANCELLED');

CREATE TABLE "auto_combat_hunt_batches" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" "AutoCombatHuntBatchStatus" NOT NULL DEFAULT 'HUNTING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastProcessedAt" TIMESTAMP(3) NOT NULL,
    "huntingLevelAtStart" INTEGER NOT NULL DEFAULT 1,
    "huntingXpGained" INTEGER NOT NULL DEFAULT 0,
    "foundEnemiesCount" INTEGER NOT NULL DEFAULT 0,
    "bonusEnemiesFound" INTEGER NOT NULL DEFAULT 0,
    "selectedEncounterId" TEXT,
    "selectedEncounterMobId" TEXT,
    "huntSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_combat_hunt_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_combat_hunt_batch_mobs" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "mobId" TEXT NOT NULL,
    "encounterId" TEXT,
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "remainingCount" INTEGER NOT NULL DEFAULT 0,
    "weightSnapshot" INTEGER NOT NULL DEFAULT 100,
    "firstFoundAt" TIMESTAMP(3),
    "lastFoundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_combat_hunt_batch_mobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auto_combat_hunt_batch_events" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "cycleKey" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_combat_hunt_batch_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auto_combat_hunt_batches_sessionId_key" ON "auto_combat_hunt_batches"("sessionId");
CREATE INDEX "auto_combat_hunt_batches_characterId_idx" ON "auto_combat_hunt_batches"("characterId");
CREATE INDEX "auto_combat_hunt_batches_mapId_idx" ON "auto_combat_hunt_batches"("mapId");
CREATE INDEX "auto_combat_hunt_batches_status_idx" ON "auto_combat_hunt_batches"("status");
CREATE INDEX "auto_combat_hunt_batches_characterId_mapId_idx" ON "auto_combat_hunt_batches"("characterId", "mapId");
CREATE INDEX "auto_combat_hunt_batches_characterId_status_idx" ON "auto_combat_hunt_batches"("characterId", "status");
CREATE INDEX "auto_combat_hunt_batches_characterId_mapId_status_idx" ON "auto_combat_hunt_batches"("characterId", "mapId", "status");
CREATE INDEX "auto_combat_hunt_batches_selectedEncounterId_idx" ON "auto_combat_hunt_batches"("selectedEncounterId");

CREATE UNIQUE INDEX "auto_combat_hunt_batch_mobs_batchId_mobId_key" ON "auto_combat_hunt_batch_mobs"("batchId", "mobId");
CREATE INDEX "auto_combat_hunt_batch_mobs_batchId_idx" ON "auto_combat_hunt_batch_mobs"("batchId");
CREATE INDEX "auto_combat_hunt_batch_mobs_mobId_idx" ON "auto_combat_hunt_batch_mobs"("mobId");
CREATE INDEX "auto_combat_hunt_batch_mobs_encounterId_idx" ON "auto_combat_hunt_batch_mobs"("encounterId");

CREATE UNIQUE INDEX "auto_combat_hunt_batch_events_batchId_sequence_key" ON "auto_combat_hunt_batch_events"("batchId", "sequence");
CREATE UNIQUE INDEX "auto_combat_hunt_batch_events_batchId_cycleKey_key" ON "auto_combat_hunt_batch_events"("batchId", "cycleKey");
CREATE INDEX "auto_combat_hunt_batch_events_batchId_idx" ON "auto_combat_hunt_batch_events"("batchId");
CREATE INDEX "auto_combat_hunt_batch_events_characterId_idx" ON "auto_combat_hunt_batch_events"("characterId");
CREATE INDEX "auto_combat_hunt_batch_events_sessionId_idx" ON "auto_combat_hunt_batch_events"("sessionId");
CREATE INDEX "auto_combat_hunt_batch_events_type_idx" ON "auto_combat_hunt_batch_events"("type");
CREATE INDEX "auto_combat_hunt_batch_events_createdAt_idx" ON "auto_combat_hunt_batch_events"("createdAt");

ALTER TABLE "auto_combat_hunt_batches" ADD CONSTRAINT "auto_combat_hunt_batches_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_combat_hunt_batches" ADD CONSTRAINT "auto_combat_hunt_batches_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "game_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_combat_hunt_batches" ADD CONSTRAINT "auto_combat_hunt_batches_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "auto_combat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_combat_hunt_batches" ADD CONSTRAINT "auto_combat_hunt_batches_selectedEncounterId_fkey" FOREIGN KEY ("selectedEncounterId") REFERENCES "sub_map_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auto_combat_hunt_batch_mobs" ADD CONSTRAINT "auto_combat_hunt_batch_mobs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "auto_combat_hunt_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_combat_hunt_batch_mobs" ADD CONSTRAINT "auto_combat_hunt_batch_mobs_mobId_fkey" FOREIGN KEY ("mobId") REFERENCES "mobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_combat_hunt_batch_mobs" ADD CONSTRAINT "auto_combat_hunt_batch_mobs_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "sub_map_encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auto_combat_hunt_batch_events" ADD CONSTRAINT "auto_combat_hunt_batch_events_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "auto_combat_hunt_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_combat_hunt_batch_events" ADD CONSTRAINT "auto_combat_hunt_batch_events_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "auto_combat_hunt_batches" (
    "id",
    "characterId",
    "mapId",
    "sessionId",
    "status",
    "startedAt",
    "stoppedAt",
    "consumedAt",
    "cancelledAt",
    "lastProcessedAt",
    "huntingLevelAtStart",
    "huntingXpGained",
    "foundEnemiesCount",
    "bonusEnemiesFound",
    "selectedEncounterId",
    "selectedEncounterMobId",
    "huntSequence",
    "createdAt",
    "updatedAt"
)
SELECT
    acs."id",
    acs."characterId",
    acs."mapId",
    acs."id",
    CASE
      WHEN acs."status" = 'ACTIVE' AND acs."phase" = 'HUNTING' THEN 'HUNTING'::"AutoCombatHuntBatchStatus"
      WHEN acs."status" = 'ACTIVE' AND acs."phase" = 'ENCOUNTER_READY' THEN 'READY'::"AutoCombatHuntBatchStatus"
      WHEN acs."status" = 'STOPPED' THEN 'CANCELLED'::"AutoCombatHuntBatchStatus"
      ELSE 'CONSUMED'::"AutoCombatHuntBatchStatus"
    END,
    COALESCE(acs."huntStartedAt", acs."startedAt"),
    acs."huntStoppedAt",
    CASE
      WHEN acs."phase" = 'COMBAT_ACTIVE' OR acs."status" IN ('FINISHED', 'DEFEATED') THEN COALESCE(acs."huntStoppedAt", acs."finishedAt", acs."lastProcessedAt")
      ELSE NULL
    END,
    CASE
      WHEN acs."status" = 'STOPPED' THEN COALESCE(acs."finishedAt", acs."lastProcessedAt")
      ELSE NULL
    END,
    COALESCE(acs."lastHuntProcessedAt", acs."huntStartedAt", acs."startedAt", acs."lastProcessedAt"),
    acs."huntingLevelAtStart",
    acs."huntingXpGained",
    acs."foundEnemiesCount",
    acs."bonusEnemiesFound",
    acs."selectedEncounterId",
    acs."selectedEncounterMobId",
    acs."foundEnemiesCount",
    acs."createdAt",
    acs."updatedAt"
FROM "auto_combat_sessions" acs
WHERE acs."mapId" IS NOT NULL;

INSERT INTO "auto_combat_hunt_batch_mobs" (
    "id",
    "batchId",
    "mobId",
    "encounterId",
    "foundCount",
    "remainingCount",
    "weightSnapshot",
    "createdAt",
    "updatedAt"
)
SELECT
    acsms."id",
    acsms."sessionId",
    acsms."mobId",
    acs."selectedEncounterId",
    acsms."foundCount",
    GREATEST(acsms."foundCount" - acsms."kills", 0),
    COALESCE(sme."weight", 100),
    acsms."createdAt",
    acsms."updatedAt"
FROM "auto_combat_session_mob_summaries" acsms
JOIN "auto_combat_sessions" acs ON acs."id" = acsms."sessionId"
LEFT JOIN "sub_map_encounters" sme ON sme."id" = acs."selectedEncounterId"
WHERE acsms."foundCount" > 0
ON CONFLICT ("batchId", "mobId") DO UPDATE SET
    "foundCount" = EXCLUDED."foundCount",
    "remainingCount" = EXCLUDED."remainingCount",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "auto_combat_hunt_batch_events" (
    "id",
    "batchId",
    "characterId",
    "sessionId",
    "type",
    "sequence",
    "cycleKey",
    "payloadJson",
    "createdAt"
)
SELECT
    acse."id",
    acse."sessionId",
    acse."characterId",
    acse."sessionId",
    acse."type",
    acse."sequence",
    COALESCE(acse."eventKey", acse."sessionId" || ':hunt:' || acse."sequence"),
    acse."payloadJson",
    acse."createdAt"
FROM "auto_combat_session_events" acse
WHERE acse."type" = 'HUNT_TARGET_FOUND'
ON CONFLICT ("batchId", "sequence") DO NOTHING;
