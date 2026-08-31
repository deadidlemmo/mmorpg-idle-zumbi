-- Fragmentos continuam negociáveis entre jogadores, mas não podem gerar Gold
-- diretamente no Mercado Negro. Esta migration não converte saldos existentes.
UPDATE "items"
SET
  "isSellable" = FALSE,
  "isTradable" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN (
  'fragmento-de-ameaca-t1',
  'fragmento-de-ameaca-t2',
  'fragmento-de-ameaca-t3',
  'fragmento-de-ameaca-t4',
  'fragmento-de-ameaca-t5',
  'fragmento-de-ameaca-t6',
  'fragmento-de-ameaca-t7',
  'fragmento-de-ameaca-t8',
  'fragmento-de-ameaca-t9',
  'fragmento-de-ameaca-t10'
);

ALTER TABLE "pet_definitions"
ADD COLUMN "fragmentItemId" TEXT;

UPDATE "pet_definitions" AS pet
SET "fragmentItemId" = fragment."id"
FROM "items" AS fragment
WHERE fragment."slug" = 'fragmento-de-ameaca-t' || pet."tier"::TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "pet_definitions"
    WHERE "fragmentItemId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Nao foi possivel vincular todos os pets aos fragmentos canonicos.';
  END IF;
END $$;

ALTER TABLE "pet_definitions"
ALTER COLUMN "fragmentItemId" SET NOT NULL;

CREATE INDEX "pet_definitions_fragmentItemId_idx"
ON "pet_definitions"("fragmentItemId");

ALTER TABLE "pet_definitions"
ADD CONSTRAINT "pet_definitions_fragmentItemId_fkey"
FOREIGN KEY ("fragmentItemId") REFERENCES "items"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
