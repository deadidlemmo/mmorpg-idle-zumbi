import { consumableDefinitions } from '../prisma/seed-data/consumables.seed-data';
import { applyAutoCombatPotionHealMultiplier } from '../src/common/utils/auto-combat-balance.util';

type AutoCombatPotionDefinition = (typeof consumableDefinitions)[number];

function isTierPotion(potion: AutoCombatPotionDefinition, tier: number) {
  return (
    potion.family === 'Poção de Vida' &&
    potion.isSellable !== false &&
    (potion.minTier ?? 1) <= tier &&
    (potion.maxTier ?? potion.minTier ?? 1) >= tier
  );
}

export function getAutoCombatPotionForTier(tier: number) {
  const safeTier = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
  const potion = consumableDefinitions
    .filter((definition) => isTierPotion(definition, safeTier))
    .sort((left, right) => left.tier - right.tier)[0];

  if (!potion) {
    throw new Error(`Pocao de auto-combate nao encontrada para T${safeTier}.`);
  }

  return potion;
}

export function calculateAutoCombatPotionHeal(params: {
  tier: number;
  maxHp: number;
  className: string;
}) {
  const potion = getAutoCombatPotionForTier(params.tier);
  const maxHp = Math.max(0, Math.floor(Number(params.maxHp) || 0));
  const baseHeal =
    Math.max(0, Math.floor(Number(potion.healFlat) || 0)) +
    Math.floor((maxHp * Math.max(0, Number(potion.healPercent) || 0)) / 100);
  const healAmount = applyAutoCombatPotionHealMultiplier({
    healAmount: baseHeal,
    className: params.className,
  });

  return {
    potion,
    baseHeal,
    healAmount,
  };
}
