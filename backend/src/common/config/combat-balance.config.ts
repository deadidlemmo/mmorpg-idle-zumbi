import type { PrimaryStats } from '../utils/stats.util';

export type AutoCombatBalanceRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';

export type AutoCombatClassPassive = {
  label: string;
  offensivePowerMultiplier: number;
  incomingDamageMultiplier: number;
  potionHealMultiplier: number;
  effectiveXpMultiplier: number;
};

export const AUTO_COMBAT_BALANCE_MODEL_KEY = 'balance-v5-6';
export const AUTO_COMBAT_BALANCE_MODEL_LABEL = 'Balance V5.6';

export const AUTO_COMBAT_BALANCE_TTK_POWER_EXPONENT = 0.75;
export const AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_MULTIPLIER = 0.38;
export const AUTO_COMBAT_BALANCE_DEFENSIVE_GATHERING_MULTIPLIER = 1.15;

export const AUTO_COMBAT_OFFENSIVE_READINESS_PER_TIER_GAP = 0.88;

export const AUTO_COMBAT_PRESSURE_BASE_WINDOW_SECONDS = 36;
export const AUTO_COMBAT_PRESSURE_SPEED_BASE_MULTIPLIER = 0.9;
export const AUTO_COMBAT_PRESSURE_SPEED_DIVISOR = 100;
export const AUTO_COMBAT_PRESSURE_MAX_MOB_SPEED = 50;
export const AUTO_COMBAT_PRESSURE_GEAR_GAP_LINEAR = 1;
export const AUTO_COMBAT_PRESSURE_GEAR_GAP_QUADRATIC = 1.7;
export const AUTO_COMBAT_PRESSURE_OVERGEAR_REDUCTION_PER_TIER = 0.08;
export const AUTO_COMBAT_PRESSURE_MIN_OVERGEAR_MULTIPLIER = 0.8;
export const AUTO_COMBAT_PRESSURE_MAX_ATTACK_OPPORTUNITIES = 18;
export const AUTO_COMBAT_UNDERGEARED_DAMAGE_START_GAP = 1;
export const AUTO_COMBAT_UNDERGEARED_DAMAGE_PER_EXCESS_GAP = 3;
export const AUTO_COMBAT_UNDERGEARED_DAMAGE_MAX_MULTIPLIER = 6;

export const AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_STATS = [
  'strength',
  'agility',
  'precision',
  'technique',
] as const satisfies Array<keyof PrimaryStats>;

export const AUTO_COMBAT_BALANCE_RISK_XP_MULTIPLIER: Record<
  AutoCombatBalanceRiskLevel,
  number
> = {
  LOW: 1,
  MEDIUM: 1,
  HIGH: 1,
  LETHAL: 1,
};

export const AUTO_COMBAT_DEFAULT_CLASS_PASSIVE: AutoCombatClassPassive = {
  label: 'Sem passiva',
  offensivePowerMultiplier: 1,
  incomingDamageMultiplier: 1,
  potionHealMultiplier: 1,
  effectiveXpMultiplier: 1,
};

export const AUTO_COMBAT_CLASS_PASSIVES: Record<
  string,
  AutoCombatClassPassive
> = {
  lutador: {
    label: 'Muralha ativa',
    offensivePowerMultiplier: 1.19,
    incomingDamageMultiplier: 0.68,
    potionHealMultiplier: 1,
    effectiveXpMultiplier: 1.1,
  },
  assassino: {
    label: 'Execucao precisa',
    offensivePowerMultiplier: 1.06,
    incomingDamageMultiplier: 0.34,
    potionHealMultiplier: 1,
    effectiveXpMultiplier: 1.1,
  },
  atirador: {
    label: 'Supressao controlada',
    offensivePowerMultiplier: 1.02,
    incomingDamageMultiplier: 0.34,
    potionHealMultiplier: 1,
    effectiveXpMultiplier: 1.1,
  },
  medico: {
    label: 'Triagem sustentada',
    offensivePowerMultiplier: 1.18,
    incomingDamageMultiplier: 0.75,
    potionHealMultiplier: 1.25,
    effectiveXpMultiplier: 1.1,
  },
};

export const AUTO_COMBAT_INCOMING_DAMAGE_MULTIPLIER_BY_CLASS_AND_TIER: Record<
  string,
  Readonly<Partial<Record<number, number>>>
> = {
  assassino: {
    3: 0.28,
    4: 0.28,
    5: 0.28,
  },
  atirador: {
    3: 0.28,
    4: 0.28,
    5: 0.28,
  },
};
