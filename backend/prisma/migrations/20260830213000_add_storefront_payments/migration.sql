-- Persist checkout state before enabling real-money payments. Prices and grants
-- remain authoritative in the backend; provider callbacks only confirm payment.

CREATE TYPE "StorefrontPaymentProvider" AS ENUM ('MERCADO_PAGO', 'STRIPE');
CREATE TYPE "StorefrontOrderStatus" AS ENUM (
  'PENDING',
  'CHECKOUT_CREATED',
  'PAYMENT_PENDING',
  'FULFILLED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'REFUNDED',
  'CHARGEBACK_REVIEW'
);
CREATE TYPE "StorefrontPaymentStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'FAILED',
  'REFUNDED',
  'CHARGEBACK_REVIEW'
);
CREATE TYPE "StorefrontSubscriptionStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
  'CANCELLED'
);

CREATE TABLE "storefront_orders" (
  "id" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(180) NOT NULL,
  "userId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "offerKey" VARCHAR(80) NOT NULL,
  "offerKind" VARCHAR(32) NOT NULL,
  "provider" "StorefrontPaymentProvider" NOT NULL,
  "status" "StorefrontOrderStatus" NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "providerCheckoutId" VARCHAR(180),
  "checkoutUrl" TEXT,
  "providerStatus" VARCHAR(80),
  "failureCode" VARCHAR(120),
  "expiresAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "fulfilledAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "storefront_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_orders_amount_check" CHECK ("amountCents" > 0),
  CONSTRAINT "storefront_orders_currency_check" CHECK ("currency" = 'BRL')
);

CREATE TABLE "storefront_payments" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" "StorefrontPaymentProvider" NOT NULL,
  "providerPaymentId" VARCHAR(180) NOT NULL,
  "providerEventId" VARCHAR(180),
  "status" "StorefrontPaymentStatus" NOT NULL,
  "providerStatus" VARCHAR(80),
  "amountCents" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "paidAt" TIMESTAMP(3),
  "periodEndsAt" TIMESTAMP(3),
  "fulfillmentAppliedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "storefront_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_payments_amount_check" CHECK ("amountCents" >= 0),
  CONSTRAINT "storefront_payments_currency_check" CHECK ("currency" = 'BRL')
);

CREATE TABLE "storefront_subscriptions" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "StorefrontPaymentProvider" NOT NULL,
  "providerSubscriptionId" VARCHAR(180) NOT NULL,
  "providerCustomerId" VARCHAR(180),
  "status" "StorefrontSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "currentPeriodEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT FALSE,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "storefront_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "storefront_orders_idempotencyKey_key"
  ON "storefront_orders"("idempotencyKey");
CREATE UNIQUE INDEX "storefront_orders_provider_providerCheckoutId_key"
  ON "storefront_orders"("provider", "providerCheckoutId");
CREATE INDEX "storefront_orders_userId_createdAt_idx"
  ON "storefront_orders"("userId", "createdAt");
CREATE INDEX "storefront_orders_characterId_createdAt_idx"
  ON "storefront_orders"("characterId", "createdAt");
CREATE INDEX "storefront_orders_status_createdAt_idx"
  ON "storefront_orders"("status", "createdAt");

CREATE UNIQUE INDEX "storefront_payments_provider_providerPaymentId_key"
  ON "storefront_payments"("provider", "providerPaymentId");
CREATE INDEX "storefront_payments_orderId_createdAt_idx"
  ON "storefront_payments"("orderId", "createdAt");
CREATE INDEX "storefront_payments_status_createdAt_idx"
  ON "storefront_payments"("status", "createdAt");

CREATE UNIQUE INDEX "storefront_subscriptions_orderId_key"
  ON "storefront_subscriptions"("orderId");
CREATE UNIQUE INDEX "storefront_subscriptions_provider_providerSubscriptionId_key"
  ON "storefront_subscriptions"("provider", "providerSubscriptionId");
CREATE INDEX "storefront_subscriptions_userId_status_idx"
  ON "storefront_subscriptions"("userId", "status");

ALTER TABLE "storefront_orders"
  ADD CONSTRAINT "storefront_orders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storefront_orders"
  ADD CONSTRAINT "storefront_orders_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "storefront_payments"
  ADD CONSTRAINT "storefront_payments_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "storefront_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storefront_subscriptions"
  ADD CONSTRAINT "storefront_subscriptions_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "storefront_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storefront_subscriptions"
  ADD CONSTRAINT "storefront_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "items" (
  "id",
  "name",
  "slug",
  "description",
  "tier",
  "rarity",
  "slot",
  "family",
  "isGatheringMaterial",
  "requiredGatheringLevel",
  "gatheringXpPerUnit",
  "healFlat",
  "healPercent",
  "usableInCombat",
  "usableOutOfCombat",
  "minTier",
  "maxTier",
  "isSellable",
  "isTradable",
  "isCraftable",
  "enhancementLevel",
  "createdAt",
  "updatedAt"
) VALUES (
  '91000000-0000-4000-8000-000000000001',
  'Passe Premium de 30 dias',
  'passe-premium-30-dias',
  'Ative pela mochila para adicionar 30 dias de Premium a toda a conta.',
  1,
  'LEGENDARY'::"Rarity",
  'CONSUMABLE'::"ItemSlot",
  'Passe Premium',
  FALSE,
  1,
  0,
  0,
  0,
  FALSE,
  TRUE,
  1,
  10,
  FALSE,
  TRUE,
  FALSE,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE SET
  "slug" = EXCLUDED."slug",
  "description" = EXCLUDED."description",
  "rarity" = EXCLUDED."rarity",
  "slot" = EXCLUDED."slot",
  "family" = EXCLUDED."family",
  "usableInCombat" = FALSE,
  "usableOutOfCombat" = TRUE,
  "isSellable" = FALSE,
  "isTradable" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;
