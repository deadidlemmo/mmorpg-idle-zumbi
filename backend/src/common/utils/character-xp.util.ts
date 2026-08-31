import type { Prisma } from '@prisma/client';
import { calculateLevelProgress, type LevelProgressResult } from './level.util';

function normalizeXpReward(gainedXp: number) {
  const parsedXp = Math.floor(Number(gainedXp));

  if (!Number.isFinite(parsedXp)) return 0;

  return Math.max(0, parsedXp);
}

/**
 * Incrementa o XP no PostgreSQL antes de recalcular o nivel. O UPDATE atomico
 * serializa recompensas concorrentes na linha do personagem e evita lost update.
 */
export async function grantCharacterXp(
  tx: Prisma.TransactionClient,
  characterId: string,
  gainedXp: number,
): Promise<LevelProgressResult> {
  const safeGainedXp = normalizeXpReward(gainedXp);

  if (safeGainedXp === 0) {
    const character = await tx.character.findUniqueOrThrow({
      where: { id: characterId },
      select: { level: true, xp: true },
    });

    return calculateLevelProgress(character.level, character.xp, 0);
  }

  const characterAfterXp = await tx.character.update({
    where: { id: characterId },
    data: {
      xp: { increment: safeGainedXp },
    },
    select: {
      level: true,
      xp: true,
    },
  });
  const levelProgress = calculateLevelProgress(
    characterAfterXp.level,
    characterAfterXp.xp - safeGainedXp,
    safeGainedXp,
  );

  if (levelProgress.newLevel !== characterAfterXp.level) {
    await tx.character.update({
      where: { id: characterId },
      data: { level: levelProgress.newLevel },
    });
  }

  return levelProgress;
}
