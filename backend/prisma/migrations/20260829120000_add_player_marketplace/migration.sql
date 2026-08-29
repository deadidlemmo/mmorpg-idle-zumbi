-- CreateEnum
CREATE TYPE "MarketListingStatus" AS ENUM ('ACTIVE', 'SOLD_OUT', 'CANCELLED');

-- CreateTable
CREATE TABLE "market_listings" (
    "id" TEXT NOT NULL,
    "sellerCharacterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryItemType" NOT NULL,
    "quantityInitial" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "quantityCancelled" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL,
    "status" "MarketListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "requestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "market_listings_quantity_initial_check" CHECK ("quantityInitial" > 0),
    CONSTRAINT "market_listings_quantity_remaining_check" CHECK (
        "quantityRemaining" >= 0 AND "quantityRemaining" <= "quantityInitial"
    ),
    CONSTRAINT "market_listings_quantity_cancelled_check" CHECK (
        "quantityCancelled" >= 0 AND "quantityCancelled" <= "quantityInitial"
    ),
    CONSTRAINT "market_listings_quantity_total_check" CHECK (
        "quantityRemaining" + "quantityCancelled" <= "quantityInitial"
    ),
    CONSTRAINT "market_listings_unit_price_check" CHECK (
        "unitPrice" BETWEEN 1 AND 1000000000
    ),
    CONSTRAINT "market_listings_state_check" CHECK (
        (
            "status" = 'ACTIVE'
            AND "quantityRemaining" > 0
            AND "quantityCancelled" = 0
            AND "closedAt" IS NULL
        )
        OR (
            "status" = 'SOLD_OUT'
            AND "quantityRemaining" = 0
            AND "quantityCancelled" = 0
            AND "closedAt" IS NOT NULL
        )
        OR (
            "status" = 'CANCELLED'
            AND "quantityRemaining" = 0
            AND "quantityCancelled" > 0
            AND "closedAt" IS NOT NULL
        )
    )
);

-- CreateTable
CREATE TABLE "market_purchases" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerCharacterId" TEXT NOT NULL,
    "sellerCharacterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "requestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "market_purchases_distinct_characters_check" CHECK (
        "buyerCharacterId" <> "sellerCharacterId"
    ),
    CONSTRAINT "market_purchases_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "market_purchases_unit_price_check" CHECK (
        "unitPrice" BETWEEN 1 AND 1000000000
    ),
    CONSTRAINT "market_purchases_total_price_check" CHECK (
        "totalPrice" BETWEEN 1 AND 2000000000
        AND "totalPrice"::BIGINT = "quantity"::BIGINT * "unitPrice"::BIGINT
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "market_listings_requestId_key" ON "market_listings"("requestId");

-- CreateIndex
CREATE INDEX "market_listings_status_createdAt_idx" ON "market_listings"("status", "createdAt");

-- CreateIndex
CREATE INDEX "market_listings_itemId_status_unitPrice_idx" ON "market_listings"("itemId", "status", "unitPrice");

-- CreateIndex
CREATE INDEX "market_listings_sellerCharacterId_status_createdAt_idx" ON "market_listings"("sellerCharacterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "market_listings_unitPrice_idx" ON "market_listings"("unitPrice");

-- CreateIndex
CREATE UNIQUE INDEX "market_purchases_requestId_key" ON "market_purchases"("requestId");

-- CreateIndex
CREATE INDEX "market_purchases_listingId_createdAt_idx" ON "market_purchases"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "market_purchases_buyerCharacterId_createdAt_idx" ON "market_purchases"("buyerCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "market_purchases_sellerCharacterId_createdAt_idx" ON "market_purchases"("sellerCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "market_purchases_itemId_createdAt_idx" ON "market_purchases"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_sellerCharacterId_fkey" FOREIGN KEY ("sellerCharacterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_purchases" ADD CONSTRAINT "market_purchases_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "market_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_purchases" ADD CONSTRAINT "market_purchases_buyerCharacterId_fkey" FOREIGN KEY ("buyerCharacterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_purchases" ADD CONSTRAINT "market_purchases_sellerCharacterId_fkey" FOREIGN KEY ("sellerCharacterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_purchases" ADD CONSTRAINT "market_purchases_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
