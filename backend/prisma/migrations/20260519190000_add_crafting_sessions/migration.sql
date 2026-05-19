-- CreateTable
CREATE TABLE "crafting_sessions" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "outputItemId" TEXT NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "quantity" INTEGER NOT NULL,
    "outputQuantity" INTEGER NOT NULL,
    "craftingXpGained" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crafting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crafting_sessions_characterId_idx" ON "crafting_sessions"("characterId");

-- CreateIndex
CREATE INDEX "crafting_sessions_recipeId_idx" ON "crafting_sessions"("recipeId");

-- CreateIndex
CREATE INDEX "crafting_sessions_outputItemId_idx" ON "crafting_sessions"("outputItemId");

-- CreateIndex
CREATE INDEX "crafting_sessions_status_idx" ON "crafting_sessions"("status");

-- CreateIndex
CREATE INDEX "crafting_sessions_characterId_status_idx" ON "crafting_sessions"("characterId", "status");

-- CreateIndex
CREATE INDEX "crafting_sessions_completesAt_idx" ON "crafting_sessions"("completesAt");

-- CreateIndex
CREATE UNIQUE INDEX "crafting_sessions_one_active_per_character_idx" ON "crafting_sessions"("characterId") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "crafting_sessions" ADD CONSTRAINT "crafting_sessions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_sessions" ADD CONSTRAINT "crafting_sessions_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "crafting_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crafting_sessions" ADD CONSTRAINT "crafting_sessions_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
