ALTER TABLE "auto_combat_hunt_batches"
ADD COLUMN "cycleTargetEncounterId" TEXT;

CREATE INDEX "auto_combat_hunt_batches_cycleTargetEncounterId_idx"
ON "auto_combat_hunt_batches"("cycleTargetEncounterId");

ALTER TABLE "auto_combat_hunt_batches"
ADD CONSTRAINT "auto_combat_hunt_batches_cycleTargetEncounterId_fkey"
FOREIGN KEY ("cycleTargetEncounterId")
REFERENCES "sub_map_encounters"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
