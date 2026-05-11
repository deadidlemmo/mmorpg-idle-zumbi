/*
  Warnings:

  - You are about to drop the column `baseAttack` on the `game_classes` table. All the data in the column will be lost.
  - You are about to drop the column `baseDefense` on the `game_classes` table. All the data in the column will be lost.
  - You are about to drop the column `baseHp` on the `game_classes` table. All the data in the column will be lost.
  - You are about to drop the column `baseSpeed` on the `game_classes` table. All the data in the column will be lost.
  - You are about to drop the column `attackBonus` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `defenseBonus` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `hpBonus` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `speedBonus` on the `items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "game_classes" DROP COLUMN "baseAttack",
DROP COLUMN "baseDefense",
DROP COLUMN "baseHp",
DROP COLUMN "baseSpeed",
ADD COLUMN     "baseAgility" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "basePrecision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "baseStrength" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "baseTechnique" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "baseVitality" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "baseWillpower" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "items" DROP COLUMN "attackBonus",
DROP COLUMN "defenseBonus",
DROP COLUMN "hpBonus",
DROP COLUMN "speedBonus",
ADD COLUMN     "agilityBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "precisionBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "strengthBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "techniqueBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vitalityBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "willpowerBonus" INTEGER NOT NULL DEFAULT 0;
