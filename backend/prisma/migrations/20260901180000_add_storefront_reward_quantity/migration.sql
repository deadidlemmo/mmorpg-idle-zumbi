ALTER TABLE "storefront_orders"
  ADD COLUMN "rewardQuantity" INTEGER NOT NULL DEFAULT 1;

UPDATE "storefront_orders"
SET "rewardQuantity" = CASE "offerKey"
  WHEN 'cash-100' THEN 100
  WHEN 'cash-200' THEN 200
  WHEN 'cash-500' THEN 500
  ELSE 1
END
WHERE "offerKind" = 'CASH_PACKAGE';

ALTER TABLE "storefront_orders"
  ADD CONSTRAINT "storefront_orders_reward_quantity_check"
  CHECK ("rewardQuantity" BETWEEN 1 AND 1000);
