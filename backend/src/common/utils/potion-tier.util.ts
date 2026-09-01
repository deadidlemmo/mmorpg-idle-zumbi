import { LEVELS_PER_TIER } from '../config/progression.config';
import { getTierByLevel } from './level.util';

type PotionTierRequirement = {
  minTier?: number | null;
};

function normalizeRequiredTier(minTier: number | null | undefined) {
  const parsedTier = Math.floor(Number(minTier));

  return Number.isFinite(parsedTier) ? Math.max(1, parsedTier) : 1;
}

export function getPotionTierAccess(params: {
  characterLevel: number;
  potion: PotionTierRequirement;
}) {
  const characterTier = getTierByLevel(params.characterLevel);
  const requiredTier = normalizeRequiredTier(params.potion.minTier);
  const requiredLevel = (requiredTier - 1) * LEVELS_PER_TIER + 1;

  return {
    allowed: characterTier >= requiredTier,
    characterTier,
    requiredTier,
    requiredLevel,
  };
}

export function isPotionTierUnlocked(params: {
  characterLevel: number;
  potion: PotionTierRequirement;
}) {
  return getPotionTierAccess(params).allowed;
}

export function getPotionTierLockedMessage(params: {
  characterLevel: number;
  potion: PotionTierRequirement & { name?: string | null };
}) {
  const access = getPotionTierAccess(params);
  const potionName = params.potion.name?.trim() || 'Esta pocao';

  return `${potionName} exige acesso ao Tier ${access.requiredTier}. Seu personagem esta no Tier ${access.characterTier}.`;
}
