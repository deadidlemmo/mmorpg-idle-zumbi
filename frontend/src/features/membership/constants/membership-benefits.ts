export const MEMBERSHIP_BENEFIT_VALUES = {
  xpBonusPercent: 20,
  freeIdleHours: 6,
  premiumIdleHours: 12,
} as const;

export const MEMBERSHIP_BENEFIT_LABELS = {
  xpBonus: `+${MEMBERSHIP_BENEFIT_VALUES.xpBonusPercent}%`,
  freeIdleLimit: `${MEMBERSHIP_BENEFIT_VALUES.freeIdleHours} horas`,
  premiumIdleLimit: `${MEMBERSHIP_BENEFIT_VALUES.premiumIdleHours} horas`,
} as const;

export const MEMBERSHIP_XP_BENEFIT_TOPICS = [
  {
    key: "character",
    label: "EXP de Personagem",
    detail: "Combate manual e automático",
  },
  {
    key: "tracking",
    label: "EXP de Rastreio",
    detail: "Ao rastrear ameaças",
  },
  {
    key: "expeditions",
    label: "EXP de Expedições",
    detail: "Nas seis profissões de coleta",
  },
  {
    key: "crafting",
    label: "EXP de Criação",
    detail: "Ao fabricar equipamentos e itens",
  },
] as const;
