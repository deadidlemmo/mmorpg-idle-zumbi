CREATE TYPE "TopIdleVoteRewardStatus" AS ENUM (
  'RECEIVED',
  'GRANTED',
  'COOLDOWN',
  'DISABLED'
);

ALTER TABLE "users"
ADD COLUMN "topIdleRewardCode" VARCHAR(36);

UPDATE "users"
SET "topIdleRewardCode" = gen_random_uuid()::text
WHERE "topIdleRewardCode" IS NULL;

ALTER TABLE "users"
ALTER COLUMN "topIdleRewardCode" SET NOT NULL;

CREATE UNIQUE INDEX "users_topIdleRewardCode_key"
ON "users"("topIdleRewardCode");

CREATE TABLE "top_idle_vote_rewards" (
  "id" TEXT NOT NULL,
  "eventId" VARCHAR(180) NOT NULL,
  "userId" TEXT,
  "identifierHash" CHAR(64) NOT NULL,
  "status" "TopIdleVoteRewardStatus" NOT NULL DEFAULT 'RECEIVED',
  "premiumDays" INTEGER NOT NULL DEFAULT 1,
  "premiumBefore" TIMESTAMP(3),
  "premiumAfter" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "grantedAt" TIMESTAMP(3),

  CONSTRAINT "top_idle_vote_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "top_idle_vote_rewards_premium_days_check"
    CHECK ("premiumDays" > 0 AND "premiumDays" <= 30)
);

CREATE UNIQUE INDEX "top_idle_vote_rewards_eventId_key"
ON "top_idle_vote_rewards"("eventId");

CREATE INDEX "top_idle_vote_rewards_userId_grantedAt_idx"
ON "top_idle_vote_rewards"("userId", "grantedAt");

CREATE INDEX "top_idle_vote_rewards_status_receivedAt_idx"
ON "top_idle_vote_rewards"("status", "receivedAt");

ALTER TABLE "top_idle_vote_rewards"
ADD CONSTRAINT "top_idle_vote_rewards_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
