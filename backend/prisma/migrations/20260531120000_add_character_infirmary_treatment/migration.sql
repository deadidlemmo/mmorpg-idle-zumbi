ALTER TABLE "characters"
  ADD COLUMN "infirmaryStartedAt" TIMESTAMP(3),
  ADD COLUMN "infirmaryEndsAt" TIMESTAMP(3);

CREATE INDEX "characters_infirmaryEndsAt_idx" ON "characters"("infirmaryEndsAt");
