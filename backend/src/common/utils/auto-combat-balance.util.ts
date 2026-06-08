import {
  AUTO_COMBAT_BALANCE_DEFENSIVE_GATHERING_MULTIPLIER,
  AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_MULTIPLIER,
  AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_STATS,
  AUTO_COMBAT_BALANCE_RISK_XP_MULTIPLIER,
  AUTO_COMBAT_CLASS_PASSIVES,
  AUTO_COMBAT_DEFAULT_CLASS_PASSIVE,
  type AutoCombatBalanceRiskLevel,
  type AutoCombatClassPassive,
} from '../config/combat-balance.config';
import { createEmptyPrimaryStats, type PrimaryStats } from './stats.util';

const PRIMARY_STAT_KEYS: Array<keyof PrimaryStats> = [
  'strength',
  'vitality',
  'agility',
  'precision',
  'technique',
  'willpower',
];

const OFFENSIVE_GATHERING_STATS = new Set<keyof PrimaryStats>(
  AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_STATS,
);

export function normalizeAutoCombatClassKey(className?: string | null): string {
  return String(className ?? '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getAutoCombatClassPassive(
  className?: string | null,
): AutoCombatClassPassive {
  return (
    AUTO_COMBAT_CLASS_PASSIVES[normalizeAutoCombatClassKey(className)] ??
    AUTO_COMBAT_DEFAULT_CLASS_PASSIVE
  );
}

export function scaleAutoCombatGatheringBonus(
  gatheringBonus?: Partial<PrimaryStats> | null,
): PrimaryStats {
  const scaled = createEmptyPrimaryStats();

  for (const stat of PRIMARY_STAT_KEYS) {
    const rawValue = Math.max(
      0,
      Math.floor(Number(gatheringBonus?.[stat] ?? 0)),
    );
    const multiplier = OFFENSIVE_GATHERING_STATS.has(stat)
      ? AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_MULTIPLIER
      : AUTO_COMBAT_BALANCE_DEFENSIVE_GATHERING_MULTIPLIER;

    scaled[stat] = Math.max(0, Math.floor(rawValue * multiplier));
  }

  return scaled;
}

export function getAutoCombatRiskXpMultiplier(
  riskLevel?: AutoCombatBalanceRiskLevel | null,
): number {
  return AUTO_COMBAT_BALANCE_RISK_XP_MULTIPLIER[riskLevel ?? 'LOW'] ?? 1;
}

export function getAutoCombatXpEfficiencyMultiplier(params: {
  className?: string | null;
  riskLevel?: AutoCombatBalanceRiskLevel | null;
}) {
  const passive = getAutoCombatClassPassive(params.className);

  return (
    getAutoCombatRiskXpMultiplier(params.riskLevel) *
    passive.effectiveXpMultiplier
  );
}

export function applyAutoCombatXpEfficiency(params: {
  baseXp: number;
  className?: string | null;
  riskLevel?: AutoCombatBalanceRiskLevel | null;
}) {
  const baseXp = Math.max(0, Math.floor(Number(params.baseXp) || 0));

  if (baseXp <= 0) {
    return 0;
  }

  return Math.max(
    1,
    Math.round(baseXp * getAutoCombatXpEfficiencyMultiplier(params)),
  );
}

export function applyAutoCombatIncomingDamageMultiplier(params: {
  attack: number;
  className?: string | null;
}) {
  const attack = Math.max(0, Number(params.attack) || 0);

  if (attack <= 0) {
    return 0;
  }

  const passive = getAutoCombatClassPassive(params.className);

  return Math.max(1, Math.floor(attack * passive.incomingDamageMultiplier));
}

export function applyAutoCombatPotionHealMultiplier(params: {
  healAmount: number;
  className?: string | null;
}) {
  const healAmount = Math.max(0, Number(params.healAmount) || 0);

  if (healAmount <= 0) {
    return 0;
  }

  const passive = getAutoCombatClassPassive(params.className);

  return Math.max(1, Math.floor(healAmount * passive.potionHealMultiplier));
}
