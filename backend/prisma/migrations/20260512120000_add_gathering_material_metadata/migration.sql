-- Add explicit metadata for official gathering materials without changing existing inventory semantics.
ALTER TABLE "items" ADD COLUMN "slug" TEXT;
ALTER TABLE "items" ADD COLUMN "materialSlot" "ItemSlot";
ALTER TABLE "items" ADD COLUMN "isGatheringMaterial" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "items_slug_key" ON "items"("slug");
CREATE INDEX "items_materialSlot_idx" ON "items"("materialSlot");
CREATE INDEX "items_isGatheringMaterial_idx" ON "items"("isGatheringMaterial");
CREATE INDEX "items_materialOrigin_materialSlot_idx" ON "items"("materialOrigin", "materialSlot");
