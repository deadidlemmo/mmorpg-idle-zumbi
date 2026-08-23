-- Metadados editoriais para garantir variedade de avatares em cada coleção.
CREATE TYPE "AvatarPresentation" AS ENUM ('MASCULINE', 'FEMININE');
CREATE TYPE "AvatarRepresentation" AS ENUM ('WHITE', 'JAPANESE', 'BLACK', 'OTHER');

ALTER TABLE "cosmetics"
ADD COLUMN "avatarPresentation" "AvatarPresentation",
ADD COLUMN "avatarRepresentation" "AvatarRepresentation",
ADD COLUMN "representationLabel" VARCHAR(40);

CREATE INDEX "cosmetics_type_classId_avatarPresentation_avatarRepresentation_idx"
ON "cosmetics"("type", "classId", "avatarPresentation", "avatarRepresentation");
