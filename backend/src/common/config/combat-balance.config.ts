import type { PrimaryStats } from '../utils/stats.util';

export type AutoCombatBalanceRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'LETHAL';

export type AutoCombatClassPassive = {
  label: string;
  offensivePowerMultiplier: number;
  incomingDamageMultiplier: number;
  potionHealMultiplier: number;
  effectiveXpMultiplier: number;
};

export const AUTO_COMBAT_BALANCE_MODEL_KEY = 'balance-v4-4';
export const AUTO_COMBAT_BALANCE_MODEL_LABEL = 'Balance V4.4';

export const AUTO_COMBAT_BALANCE_TTK_POWER_EXPONENT = 0.1;
export const AUTO_COMBAT_BALANCE_OFFENSIVE_GATHERING_MULTIPLIER = 0.38;
export const AUTO_COMBAT_BALANCE_DEFENSIVE_GATHERING_MULTIPLIER = 1.15;

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
    offensivePowerMultiplier: 1.02,
    incomingDamageMultiplier: 0.65,
    potionHealMultiplier: 1,
    effectiveXpMultiplier: 0.98,
  },
  atirador: {
    label: 'Supressao controlada',
    offensivePowerMultiplier: 1.02,
    incomingDamageMultiplier: 0.65,
    potionHealMultiplier: 1,
    effectiveXpMultiplier: 0.98,
  },
  medico: {
    label: 'Triagem sustentada',
    offensivePowerMultiplier: 1.18,
    incomingDamageMultiplier: 0.75,
    potionHealMultiplier: 1.5,
    effectiveXpMultiplier: 1.1,
  },
};
