import { IncursionDifficulty, IncursionRewardType, Rarity } from '@prisma/client';
import type { IncursionSeedData } from '../seed-types';

const MIN_INCURSION_DURATION_SECONDS = 1800;

const tierBalance: Record<number, { costA: number; costB: number; durationA: number; durationB: number; xpA: number; xpB: number; goldMin: number; goldMax: number }> = {
  1: { costA: 50, costB: 100, durationA: 1800, durationB: 1800, xpA: 120, xpB: 160, goldMin: 10, goldMax: 30 },
  2: { costA: 125, costB: 180, durationA: 2100, durationB: 2400, xpA: 260, xpB: 340, goldMin: 20, goldMax: 60 },
  3: { costA: 280, costB: 380, durationA: 2400, durationB: 3000, xpA: 520, xpB: 680, goldMin: 40, goldMax: 100 },
  4: { costA: 520, costB: 680, durationA: 3000, durationB: 3600, xpA: 900, xpB: 1150, goldMin: 70, goldMax: 160 },
  5: { costA: 850, costB: 1150, durationA: 3600, durationB: 4500, xpA: 1400, xpB: 1800, goldMin: 110, goldMax: 260 },
  6: { costA: 1350, costB: 1750, durationA: 4500, durationB: 5400, xpA: 2100, xpB: 2700, goldMin: 170, goldMax: 380 },
  7: { costA: 2100, costB: 2700, durationA: 5400, durationB: 6300, xpA: 3100, xpB: 3900, goldMin: 260, goldMax: 560 },
  8: { costA: 3200, costB: 4100, durationA: 6300, durationB: 7200, xpA: 4500, xpB: 5600, goldMin: 390, goldMax: 820 },
  9: { costA: 5200, costB: 6800, durationA: 7200, durationB: 9000, xpA: 6500, xpB: 8200, goldMin: 580, goldMax: 1200 },
  10: { costA: 8500, costB: 11500, durationA: 9000, durationB: 10800, xpA: 9500, xpB: 12000, goldMin: 900, goldMax: 1800 },
};

const mapIncursions = [
  { mapName: 'Subúrbio Silencioso', tier: 1, minLevel: 1, maxLevel: 10, names: ['Casas Seladas', 'Porão dos Infectados'] },
  { mapName: 'Distrito da Ferrugem', tier: 2, minLevel: 11, maxLevel: 20, names: ['Galpão do Capataz', 'Oficina Enferrujada'] },
  { mapName: 'Hospital Santa Ruína', tier: 3, minLevel: 21, maxLevel: 30, names: ['Ala de Isolamento', 'Necrotério Lacrado'] },
  { mapName: 'Terminal dos Esquecidos', tier: 4, minLevel: 31, maxLevel: 40, names: ['Plataforma Morta', 'Túneis de Embarque'] },
  { mapName: 'Zona de Quarentena 9', tier: 5, minLevel: 41, maxLevel: 50, names: ['Bloco de Contenção', 'Posto de Triagem Selado'] },
  { mapName: 'Refinaria do Pó Cinzento', tier: 6, minLevel: 51, maxLevel: 60, names: ['Sala das Caldeiras', 'Tanques de Cinza'] },
  { mapName: 'Avenida dos Caídos', tier: 7, minLevel: 61, maxLevel: 70, names: ['Viaduto dos Mortos', 'Comboio Abandonado'] },
  { mapName: 'Complexo Helix', tier: 8, minLevel: 71, maxLevel: 80, names: ['Laboratório Helix', 'Câmara Experimental'] },
  { mapName: 'Necrópole Industrial', tier: 9, minLevel: 81, maxLevel: 90, names: ['Forja dos Corpos', 'Núcleo de Sucata Viva'] },
  { mapName: 'Marco Zero', tier: 10, minLevel: 91, maxLevel: 100, names: ['Cratera Carmesim', 'Santuário da Ruína'] },
] as const;

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getDifficulty(tier: number, index: number) {
  if (tier >= 9) return IncursionDifficulty.EXTREME;
  if (tier >= 6 || index === 1) return IncursionDifficulty.HIGH;
  if (tier >= 3) return IncursionDifficulty.MEDIUM;
  return IncursionDifficulty.LOW;
}

function buildLoot(tier: number, index: number): IncursionSeedData['lootTable'] {
  const balance = tierBalance[tier];
  return [
    {
      rewardType: IncursionRewardType.XP,
      chance: 100,
      minQuantity: index === 0 ? balance.xpA : balance.xpB,
      maxQuantity: index === 0 ? balance.xpA : balance.xpB,
      guaranteed: true,
      sortOrder: 1,
    },
    {
      rewardType: IncursionRewardType.GOLD,
      chance: 25 + tier,
      minQuantity: balance.goldMin,
      maxQuantity: balance.goldMax,
      guaranteed: false,
      rarity: tier >= 9 ? Rarity.LEGENDARY : tier >= 7 ? Rarity.EPIC : tier >= 5 ? Rarity.RARE : tier >= 3 ? Rarity.UNCOMMON : Rarity.COMMON,
      sortOrder: 2,
    },
  ];
}

export const incursionDefinitions: IncursionSeedData[] = mapIncursions.flatMap(
  (definition) => {
    const balance = tierBalance[definition.tier];

    return definition.names.map((name, index) => ({
      name,
      slug: slugify(`${definition.mapName}-${name}`),
      description: `${name} é uma incursão temporizada em ${definition.mapName}, preparada para grupos de sobreviventes que aceitam pagar gold por uma chance de recuperar EXP, suprimentos e recompensas raras do tier ${definition.tier}.`,
      mapName: definition.mapName,
      tier: definition.tier,
      minLevel: definition.minLevel,
      maxLevel: definition.maxLevel,
      goldCost: index === 0 ? balance.costA : balance.costB,
      durationSeconds: Math.max(
        MIN_INCURSION_DURATION_SECONDS,
        index === 0 ? balance.durationA : balance.durationB,
      ),
      difficulty: getDifficulty(definition.tier, index),
      riskLevel: Math.min(10, definition.tier + index),
      isActive: true,
      sortOrder: definition.tier * 10 + index,
      lootTable: buildLoot(definition.tier, index),
    }));
  },
);
