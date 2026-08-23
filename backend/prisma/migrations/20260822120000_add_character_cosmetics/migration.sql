-- CreateEnum
CREATE TYPE "CosmeticType" AS ENUM ('AVATAR', 'AVATAR_FRAME', 'PROFILE_BANNER', 'OVERVIEW_BACKGROUND', 'PROFILE_EFFECT', 'TITLE', 'BADGE');

-- CreateEnum
CREATE TYPE "CosmeticAccessType" AS ENUM ('FREE', 'PREMIUM', 'ENTITLEMENT');

-- CreateEnum
CREATE TYPE "CosmeticGrantSource" AS ENUM ('PURCHASE', 'BUNDLE', 'SEASON_PASS', 'EVENT', 'ACHIEVEMENT', 'ADMIN');

-- CreateTable
CREATE TABLE "cosmetic_collections" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "coverAssetKey" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cosmetic_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cosmetics" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "type" "CosmeticType" NOT NULL,
    "accessType" "CosmeticAccessType" NOT NULL DEFAULT 'ENTITLEMENT',
    "rarity" "Rarity" NOT NULL DEFAULT 'COMMON',
    "assetKey" VARCHAR(120),
    "effectPreset" VARCHAR(60),
    "displayText" VARCHAR(80),
    "accentColor" VARCHAR(16),
    "classId" TEXT,
    "collectionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cosmetic_entitlements" (
    "id" TEXT NOT NULL,
    "grantKey" VARCHAR(220) NOT NULL,
    "userId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "source" "CosmeticGrantSource" NOT NULL,
    "sourceReference" VARCHAR(120),
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "user_cosmetic_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_appearances" (
    "characterId" TEXT NOT NULL,
    "avatarCosmeticId" TEXT,
    "avatarFrameCosmeticId" TEXT,
    "profileBannerCosmeticId" TEXT,
    "overviewBackgroundCosmeticId" TEXT,
    "profileEffectCosmeticId" TEXT,
    "titleCosmeticId" TEXT,
    "badgeCosmeticId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_appearances_pkey" PRIMARY KEY ("characterId")
);

-- CreateIndex
CREATE UNIQUE INDEX "cosmetic_collections_key_key" ON "cosmetic_collections"("key");
CREATE INDEX "cosmetic_collections_isActive_sortOrder_idx" ON "cosmetic_collections"("isActive", "sortOrder");
CREATE INDEX "cosmetic_collections_startsAt_endsAt_idx" ON "cosmetic_collections"("startsAt", "endsAt");

CREATE UNIQUE INDEX "cosmetics_key_key" ON "cosmetics"("key");
CREATE INDEX "cosmetics_type_isActive_sortOrder_idx" ON "cosmetics"("type", "isActive", "sortOrder");
CREATE INDEX "cosmetics_accessType_idx" ON "cosmetics"("accessType");
CREATE INDEX "cosmetics_classId_idx" ON "cosmetics"("classId");
CREATE INDEX "cosmetics_collectionId_idx" ON "cosmetics"("collectionId");

CREATE UNIQUE INDEX "user_cosmetic_entitlements_grantKey_key" ON "user_cosmetic_entitlements"("grantKey");
CREATE INDEX "user_cosmetic_entitlements_userId_revokedAt_expiresAt_idx" ON "user_cosmetic_entitlements"("userId", "revokedAt", "expiresAt");
CREATE INDEX "user_cosmetic_entitlements_cosmeticId_idx" ON "user_cosmetic_entitlements"("cosmeticId");
CREATE INDEX "user_cosmetic_entitlements_source_sourceReference_idx" ON "user_cosmetic_entitlements"("source", "sourceReference");

CREATE INDEX "character_appearances_avatarCosmeticId_idx" ON "character_appearances"("avatarCosmeticId");
CREATE INDEX "character_appearances_avatarFrameCosmeticId_idx" ON "character_appearances"("avatarFrameCosmeticId");
CREATE INDEX "character_appearances_profileBannerCosmeticId_idx" ON "character_appearances"("profileBannerCosmeticId");
CREATE INDEX "character_appearances_overviewBackgroundCosmeticId_idx" ON "character_appearances"("overviewBackgroundCosmeticId");
CREATE INDEX "character_appearances_profileEffectCosmeticId_idx" ON "character_appearances"("profileEffectCosmeticId");
CREATE INDEX "character_appearances_titleCosmeticId_idx" ON "character_appearances"("titleCosmeticId");
CREATE INDEX "character_appearances_badgeCosmeticId_idx" ON "character_appearances"("badgeCosmeticId");

-- AddForeignKey
ALTER TABLE "cosmetics" ADD CONSTRAINT "cosmetics_classId_fkey" FOREIGN KEY ("classId") REFERENCES "game_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cosmetics" ADD CONSTRAINT "cosmetics_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "cosmetic_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_cosmetic_entitlements" ADD CONSTRAINT "user_cosmetic_entitlements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_cosmetic_entitlements" ADD CONSTRAINT "user_cosmetic_entitlements_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "cosmetics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_avatarCosmeticId_fkey" FOREIGN KEY ("avatarCosmeticId") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_avatarFrameCosmeticId_fkey" FOREIGN KEY ("avatarFrameCosmeticId") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_profileBannerCosmeticId_fkey" FOREIGN KEY ("profileBannerCosmeticId") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_overviewBackgroundCosmeticId_fkey" FOREIGN KEY ("overviewBackgroundCosmeticId") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_profileEffectCosmeticId_fkey" FOREIGN KEY ("profileEffectCosmeticId") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_titleCosmeticId_fkey" FOREIGN KEY ("titleCosmeticId") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "character_appearances" ADD CONSTRAINT "character_appearances_badgeCosmeticId_fkey" FOREIGN KEY ("badgeCosmeticId") REFERENCES "cosmetics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
