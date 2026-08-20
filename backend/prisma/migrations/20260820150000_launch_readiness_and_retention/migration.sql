-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('DAILY', 'WEEKLY', 'STORY');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLAIMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsVersion" TEXT,
ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "privacyVersion" TEXT,
ADD COLUMN "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspensionReason" TEXT;

-- AlterTable
ALTER TABLE "character_incursion_sessions"
ADD COLUMN "approach" TEXT NOT NULL DEFAULT 'BALANCED',
ADD COLUMN "successChance" INTEGER NOT NULL DEFAULT 85,
ADD COLUMN "rewardMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "outcomeRoll" DOUBLE PRECISION,
ADD COLUMN "outcomeSummary" TEXT;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedIp" TEXT,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "friendships_distinct_users" CHECK ("requesterId" <> "addresseeId")
);

-- CreateTable
CREATE TABLE "character_tutorial_progress" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "character_tutorial_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "MissionType" NOT NULL,
    "objectiveType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "rewardXp" INTEGER NOT NULL DEFAULT 0,
    "rewardGold" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mission_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_missions" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "targetValue" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    CONSTRAINT "character_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "rewardCash" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "achievement_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_achievements" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    CONSTRAINT "character_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");
CREATE INDEX "password_reset_tokens_userId_usedAt_createdAt_idx" ON "password_reset_tokens"("userId", "usedAt", "createdAt");
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE UNIQUE INDEX "friendships_requesterId_addresseeId_key" ON "friendships"("requesterId", "addresseeId");
CREATE UNIQUE INDEX "friendships_pairKey_key" ON "friendships"("pairKey");
CREATE INDEX "friendships_requesterId_status_idx" ON "friendships"("requesterId", "status");
CREATE INDEX "friendships_addresseeId_status_idx" ON "friendships"("addresseeId", "status");
CREATE UNIQUE INDEX "character_tutorial_progress_characterId_key" ON "character_tutorial_progress"("characterId");
CREATE UNIQUE INDEX "mission_definitions_key_key" ON "mission_definitions"("key");
CREATE INDEX "mission_definitions_type_isActive_idx" ON "mission_definitions"("type", "isActive");
CREATE INDEX "mission_definitions_sortOrder_idx" ON "mission_definitions"("sortOrder");
CREATE UNIQUE INDEX "character_missions_characterId_missionId_periodKey_key" ON "character_missions"("characterId", "missionId", "periodKey");
CREATE INDEX "character_missions_characterId_status_idx" ON "character_missions"("characterId", "status");
CREATE INDEX "character_missions_expiresAt_idx" ON "character_missions"("expiresAt");
CREATE UNIQUE INDEX "achievement_definitions_key_key" ON "achievement_definitions"("key");
CREATE INDEX "achievement_definitions_metricKey_isActive_idx" ON "achievement_definitions"("metricKey", "isActive");
CREATE INDEX "achievement_definitions_sortOrder_idx" ON "achievement_definitions"("sortOrder");
CREATE UNIQUE INDEX "character_achievements_characterId_achievementId_key" ON "character_achievements"("characterId", "achievementId");
CREATE INDEX "character_achievements_characterId_unlockedAt_idx" ON "character_achievements"("characterId", "unlockedAt");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_tutorial_progress" ADD CONSTRAINT "character_tutorial_progress_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_missions" ADD CONSTRAINT "character_missions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_missions" ADD CONSTRAINT "character_missions_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "mission_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_achievements" ADD CONSTRAINT "character_achievements_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_achievements" ADD CONSTRAINT "character_achievements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievement_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
