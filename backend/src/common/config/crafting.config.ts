export const CRAFTING_LEVEL_CAP = 100;
export const CRAFTING_LEVELS_PER_TIER = 10;
export const CRAFTING_TARGET_CRAFTS_PER_TIER = 45;

export function getCraftingXpToNextLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

  if (safeLevel >= CRAFTING_LEVEL_CAP) {
    return null;
  }

  return safeLevel * 20;
}

export function getRequiredCraftingLevelForTier(tier: number) {
  const safeTier = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));

  return (safeTier - 1) * CRAFTING_LEVELS_PER_TIER + 1;
}

export function getUnlockedCraftingTier(level: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));

  return Math.max(
    1,
    Math.min(10, Math.ceil(safeLevel / CRAFTING_LEVELS_PER_TIER)),
  );
}

export function getCraftingXpProgressPercent(
  xp: number,
  xpToNextLevel: number | null,
) {
  if (!xpToNextLevel || xpToNextLevel <= 0) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.floor((xp / xpToNextLevel) * 100)));
}

export function getCraftingXpRewardForTier(tier: number) {
  const safeTier = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
  const startLevel = getRequiredCraftingLevelForTier(safeTier);
  const endLevel = Math.min(
    CRAFTING_LEVEL_CAP - 1,
    safeTier * CRAFTING_LEVELS_PER_TIER,
  );

  let totalTierXp = 0;

  for (let level = startLevel; level <= endLevel; level += 1) {
    totalTierXp += getCraftingXpToNextLevel(level) ?? 0;
  }

  return Math.max(5, Math.round(totalTierXp / CRAFTING_TARGET_CRAFTS_PER_TIER));
}
