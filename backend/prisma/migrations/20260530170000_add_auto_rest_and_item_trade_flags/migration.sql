-- Add item trade flags for bound starter supplies and configurable auto-rest.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "isSellable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "isTradable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "character_potion_configs" ADD COLUMN IF NOT EXISTS "autoRestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "character_potion_configs" ADD COLUMN IF NOT EXISTS "autoRestStartHpPercent" INTEGER NOT NULL DEFAULT 35;
ALTER TABLE "character_potion_configs" ADD COLUMN IF NOT EXISTS "autoRestStopHpPercent" INTEGER NOT NULL DEFAULT 70;

CREATE INDEX IF NOT EXISTS "items_isSellable_idx" ON "items"("isSellable");
CREATE INDEX IF NOT EXISTS "items_isTradable_idx" ON "items"("isTradable");
