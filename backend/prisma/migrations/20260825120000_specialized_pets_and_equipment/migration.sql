CREATE TYPE "PetSpecialization" AS ENUM (
  'GATHERING_DESMANCHE',
  'GATHERING_COLETA',
  'GATHERING_PATRULHA',
  'GATHERING_ARSENAL',
  'GATHERING_TECNOVARREDURA',
  'GATHERING_CONTENCAO',
  'AUTO_COMBAT_TTK',
  'AUTO_COMBAT_HUNTING'
);

CREATE TYPE "PetEffectType" AS ENUM (
  'GATHERING_TIME_REDUCTION',
  'AUTO_COMBAT_TTK_REDUCTION',
  'HUNTING_TIME_REDUCTION'
);

ALTER TYPE "EconomyResourceType" ADD VALUE 'PET';

ALTER TABLE "pet_definitions"
ADD COLUMN "specialization" "PetSpecialization",
ADD COLUMN "effectType" "PetEffectType",
ADD COLUMN "effectBasisPoints" INTEGER,
ADD COLUMN "npcSaleGold" INTEGER;

UPDATE "pet_definitions"
SET
  "specialization" = CASE "key"
    WHEN 'farejador-suburbio' THEN 'AUTO_COMBAT_HUNTING'::"PetSpecialization"
    WHEN 'mastim-ferruginoso' THEN 'AUTO_COMBAT_TTK'::"PetSpecialization"
    WHEN 'simbionte-clinico' THEN 'GATHERING_CONTENCAO'::"PetSpecialization"
    WHEN 'corvo-do-terminal' THEN 'GATHERING_PATRULHA'::"PetSpecialization"
    WHEN 'sentinela-da-quarentena' THEN 'GATHERING_CONTENCAO'::"PetSpecialization"
    ELSE 'AUTO_COMBAT_HUNTING'::"PetSpecialization"
  END,
  "effectBasisPoints" = CASE "tier"
    WHEN 1 THEN 300
    WHEN 2 THEN 400
    WHEN 3 THEN 500
    WHEN 4 THEN 600
    ELSE 750
  END,
  "npcSaleGold" = CASE "tier"
    WHEN 1 THEN 120
    WHEN 2 THEN 300
    WHEN 3 THEN 640
    WHEN 4 THEN 1200
    ELSE 2000
  END;

UPDATE "pet_definitions"
SET "effectType" = CASE
  WHEN "specialization" IN (
    'GATHERING_DESMANCHE'::"PetSpecialization",
    'GATHERING_COLETA'::"PetSpecialization",
    'GATHERING_PATRULHA'::"PetSpecialization",
    'GATHERING_ARSENAL'::"PetSpecialization",
    'GATHERING_TECNOVARREDURA'::"PetSpecialization",
    'GATHERING_CONTENCAO'::"PetSpecialization"
  ) THEN 'GATHERING_TIME_REDUCTION'::"PetEffectType"
  WHEN "specialization" = 'AUTO_COMBAT_TTK'::"PetSpecialization"
    THEN 'AUTO_COMBAT_TTK_REDUCTION'::"PetEffectType"
  ELSE 'HUNTING_TIME_REDUCTION'::"PetEffectType"
END;

ALTER TABLE "pet_definitions"
ALTER COLUMN "specialization" SET NOT NULL,
ALTER COLUMN "effectType" SET NOT NULL,
ALTER COLUMN "effectBasisPoints" SET NOT NULL,
ALTER COLUMN "npcSaleGold" SET NOT NULL;

ALTER TABLE "pet_definitions"
ADD CONSTRAINT "pet_definitions_effect_basis_points_check"
CHECK ("effectBasisPoints" >= 0 AND "effectBasisPoints" < 10000),
ADD CONSTRAINT "pet_definitions_npc_sale_gold_check"
CHECK ("npcSaleGold" >= 0);

CREATE INDEX "pet_definitions_specialization_tier_isActive_idx"
ON "pet_definitions"("specialization", "tier", "isActive");

CREATE INDEX "pet_definitions_effectType_tier_isActive_idx"
ON "pet_definitions"("effectType", "tier", "isActive");

ALTER TABLE "characters" ADD COLUMN "equippedPetId" TEXT;

CREATE UNIQUE INDEX "characters_equippedPetId_key"
ON "characters"("equippedPetId");

ALTER TABLE "characters"
ADD CONSTRAINT "characters_equippedPetId_fkey"
FOREIGN KEY ("equippedPetId") REFERENCES "character_pets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "world_boss_rewards"
ADD COLUMN "randomPetCocoon" BOOLEAN NOT NULL DEFAULT false;

UPDATE "world_boss_rewards"
SET "randomPetCocoon" = true, "itemId" = NULL
WHERE "rewardType" = 'PET_EGG';

UPDATE "items"
SET
  "name" = 'Casulo de Rastreamento T1',
  "slug" = 'casulo-de-rastreamento-t1'
WHERE "name" = 'Casulo Infectado T1';

UPDATE "items"
SET
  "name" = 'Casulo de Combate T2',
  "slug" = 'casulo-de-combate-t2'
WHERE "name" = 'Casulo Infectado T2';

UPDATE "items"
SET
  "name" = 'Casulo de Contenção T3',
  "slug" = 'casulo-de-contencao-t3'
WHERE "name" = 'Casulo Infectado T3';

UPDATE "items"
SET
  "name" = 'Casulo de Patrulha T4',
  "slug" = 'casulo-de-patrulha-t4'
WHERE "name" = 'Casulo Infectado T4';

UPDATE "items"
SET
  "name" = 'Casulo de Contenção T5',
  "slug" = 'casulo-de-contencao-t5'
WHERE "name" = 'Casulo Infectado T5';
