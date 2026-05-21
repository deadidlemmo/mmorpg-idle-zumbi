-- CreateTable
CREATE TABLE "bank_items" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryItemType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_items_characterId_itemId_key" ON "bank_items"("characterId", "itemId");

-- CreateIndex
CREATE INDEX "bank_items_characterId_idx" ON "bank_items"("characterId");

-- CreateIndex
CREATE INDEX "bank_items_itemId_idx" ON "bank_items"("itemId");

-- CreateIndex
CREATE INDEX "bank_items_type_idx" ON "bank_items"("type");

-- AddForeignKey
ALTER TABLE "bank_items" ADD CONSTRAINT "bank_items_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_items" ADD CONSTRAINT "bank_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
