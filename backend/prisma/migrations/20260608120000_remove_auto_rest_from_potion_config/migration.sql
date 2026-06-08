ALTER TABLE "character_potion_configs"
  DROP COLUMN IF EXISTS "autoRestEnabled",
  DROP COLUMN IF EXISTS "autoRestStartHpPercent",
  DROP COLUMN IF EXISTS "autoRestStopHpPercent";
