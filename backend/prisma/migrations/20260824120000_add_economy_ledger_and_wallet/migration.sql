-- CreateEnum
CREATE TYPE "EconomyDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "EconomyResourceType" AS ENUM ('GOLD', 'CASH', 'XP', 'ITEM', 'CURRENCY');

-- CreateEnum
CREATE TYPE "EconomyCurrency" AS ENUM ('INCURSION_TOKEN', 'WORLD_BOSS_FRAGMENT');

-- CreateTable
CREATE TABLE "character_economy_balances" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "currency" "EconomyCurrency" NOT NULL,
    "tier" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "character_economy_balances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "character_economy_balances_tier_check" CHECK ("tier" BETWEEN 1 AND 10),
    CONSTRAINT "character_economy_balances_balance_check" CHECK ("balance" >= 0)
);

-- CreateTable
CREATE TABLE "economy_ledger_entries" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT,
    "direction" "EconomyDirection" NOT NULL,
    "resourceType" "EconomyResourceType" NOT NULL,
    "currency" "EconomyCurrency",
    "tier" INTEGER,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "reason" VARCHAR(80) NOT NULL,
    "referenceType" VARCHAR(80),
    "referenceId" VARCHAR(120),
    "idempotencyKey" VARCHAR(220) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "economy_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "economy_ledger_entries_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "economy_ledger_entries_tier_check" CHECK ("tier" IS NULL OR "tier" BETWEEN 0 AND 10),
    CONSTRAINT "economy_ledger_entries_currency_check" CHECK (
      ("resourceType" = 'CURRENCY' AND "currency" IS NOT NULL AND "tier" IS NOT NULL)
      OR ("resourceType" <> 'CURRENCY' AND "currency" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "character_economy_balances_characterId_currency_tier_key"
ON "character_economy_balances"("characterId", "currency", "tier");

-- CreateIndex
CREATE INDEX "character_economy_balances_characterId_idx"
ON "character_economy_balances"("characterId");

-- CreateIndex
CREATE INDEX "character_economy_balances_currency_tier_idx"
ON "character_economy_balances"("currency", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "economy_ledger_entries_idempotencyKey_key"
ON "economy_ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "economy_ledger_entries_characterId_createdAt_idx"
ON "economy_ledger_entries"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "economy_ledger_entries_resourceType_direction_createdAt_idx"
ON "economy_ledger_entries"("resourceType", "direction", "createdAt");

-- CreateIndex
CREATE INDEX "economy_ledger_entries_currency_tier_createdAt_idx"
ON "economy_ledger_entries"("currency", "tier", "createdAt");

-- CreateIndex
CREATE INDEX "economy_ledger_entries_itemId_createdAt_idx"
ON "economy_ledger_entries"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "economy_ledger_entries_reason_createdAt_idx"
ON "economy_ledger_entries"("reason", "createdAt");

-- CreateIndex
CREATE INDEX "economy_ledger_entries_referenceType_referenceId_idx"
ON "economy_ledger_entries"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "character_economy_balances"
ADD CONSTRAINT "character_economy_balances_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economy_ledger_entries"
ADD CONSTRAINT "economy_ledger_entries_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economy_ledger_entries"
ADD CONSTRAINT "economy_ledger_entries_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
