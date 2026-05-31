export type FarmPenaltyResult = {
  characterTier: number;
  targetTier: number;
  tierDifference: number;

  xpMultiplier: number;
  rareDropMultiplier: number;
  commonDropMultiplier: number;
};

export function getTierByCharacterLevel(level: number): number {
  if (level <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(level / 10));
}

export function calculateTierFarmPenalty(
  characterLevel: number,
  targetTier: number,
): FarmPenaltyResult {
  const characterTier = getTierByCharacterLevel(characterLevel);
  const tierDifference = characterTier - targetTier;

  // Mesmo tier ou tier acima: sem penalidade.
  if (tierDifference <= 0) {
    return {
      characterTier,
      targetTier,
      tierDifference,
      xpMultiplier: 1,
      rareDropMultiplier: 1,
      commonDropMultiplier: 1,
    };
  }

  // Personagem 1 tier acima farmando tier anterior.
  if (tierDifference === 1) {
    return {
      characterTier,
      targetTier,
      tierDifference,
      xpMultiplier: 0.35,
      rareDropMultiplier: 0.6,
      commonDropMultiplier: 0.9,
    };
  }

  // Personagem 2 tiers acima.
  if (tierDifference === 2) {
    return {
      characterTier,
      targetTier,
      tierDifference,
      xpMultiplier: 0.1,
      rareDropMultiplier: 0.3,
      commonDropMultiplier: 0.7,
    };
  }

  // Personagem 3 ou mais tiers acima.
  return {
    characterTier,
    targetTier,
    tierDifference,
    xpMultiplier: 0.03,
    rareDropMultiplier: 0.1,
    commonDropMultiplier: 0.5,
  };
}

export function applyXpPenalty(baseXp: number, xpMultiplier: number): number {
  if (baseXp <= 0) {
    return 0;
  }

  const finalXp = Math.floor(baseXp * xpMultiplier);

  return Math.max(0, finalXp);
}

export function applyDropChancePenalty(
  baseDropChance: number,
  multiplier: number,
): number {
  if (baseDropChance <= 0) {
    return 0;
  }

  const finalChance = Math.floor(baseDropChance * multiplier);

  return Math.min(100, Math.max(0, finalChance));
}

export function isRareOrEquipmentDrop(itemSlot: string): boolean {
  return itemSlot !== 'MATERIAL' && itemSlot !== 'CONSUMABLE';
}

export function getDropMultiplierByItemSlot(
  itemSlot: string,
  penalty: FarmPenaltyResult,
): number {
  if (isRareOrEquipmentDrop(itemSlot)) {
    return penalty.rareDropMultiplier;
  }

  return penalty.commonDropMultiplier;
}
