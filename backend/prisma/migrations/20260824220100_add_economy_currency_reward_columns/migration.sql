-- AlterTable
ALTER TABLE "incursion_loot_tables"
ADD COLUMN "currency" "EconomyCurrency";

-- AlterTable
ALTER TABLE "incursion_session_rewards"
ADD COLUMN "currency" "EconomyCurrency";

-- AlterTable
ALTER TABLE "world_boss_rewards"
ADD COLUMN "currency" "EconomyCurrency";

-- AlterTable
ALTER TABLE "world_boss_granted_rewards"
ADD COLUMN "currency" "EconomyCurrency";

-- CreateIndex
CREATE INDEX "incursion_loot_tables_currency_idx"
ON "incursion_loot_tables"("currency");

-- CreateIndex
CREATE INDEX "incursion_session_rewards_currency_idx"
ON "incursion_session_rewards"("currency");

-- CreateIndex
CREATE INDEX "world_boss_rewards_currency_idx"
ON "world_boss_rewards"("currency");

-- CreateIndex
CREATE INDEX "world_boss_granted_rewards_currency_idx"
ON "world_boss_granted_rewards"("currency");

-- CheckConstraint
ALTER TABLE "incursion_loot_tables"
ADD CONSTRAINT "incursion_loot_tables_currency_check" CHECK (
  ("rewardType" = 'CURRENCY' AND "currency" IS NOT NULL AND "itemId" IS NULL)
  OR ("rewardType" <> 'CURRENCY' AND "currency" IS NULL)
);

-- CheckConstraint
ALTER TABLE "incursion_session_rewards"
ADD CONSTRAINT "incursion_session_rewards_currency_check" CHECK (
  ("rewardType" = 'CURRENCY' AND "currency" IS NOT NULL AND "itemId" IS NULL)
  OR ("rewardType" <> 'CURRENCY' AND "currency" IS NULL)
);

-- CheckConstraint
ALTER TABLE "world_boss_rewards"
ADD CONSTRAINT "world_boss_rewards_currency_check" CHECK (
  ("rewardType" = 'CURRENCY' AND "currency" IS NOT NULL AND "itemId" IS NULL)
  OR ("rewardType" <> 'CURRENCY' AND "currency" IS NULL)
);

-- CheckConstraint
ALTER TABLE "world_boss_granted_rewards"
ADD CONSTRAINT "world_boss_granted_rewards_currency_check" CHECK (
  ("rewardType" = 'CURRENCY' AND "currency" IS NOT NULL AND "itemId" IS NULL)
  OR ("rewardType" <> 'CURRENCY' AND "currency" IS NULL)
);
