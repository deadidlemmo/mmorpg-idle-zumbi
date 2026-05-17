import { Rarity, WorldBossRewardType } from '@prisma/client';
import type { WorldBossSeedData } from '../seed-types';

const EVENT_DURATION_SECONDS = 3 * 60 * 60;
const SCALING_WINDOW_SECONDS = 10 * 60;

const bossNamesByTier = [
  ['Subúrbio Silencioso', ['Síndico Devorado', 'Cão Alfa da Rua das Cercas']],
  ['Distrito da Ferrugem', ['Capataz Enferrujado', 'Empilhadeira Carniceira']],
  ['Hospital Santa Ruína', ['Cirurgião Sem Pulso', 'Paciente Zero da Ala Norte']],
  ['Terminal dos Esquecidos', ['Fiscal dos Mortos', 'Condutor Sem Rota']],
  ['Zona de Quarentena 9', ['Comandante Lacrado', 'Besta de Descontaminação']],
  ['Refinaria do Pó Cinzento', ['Forneiro Cinzento', 'Tanque Vivo']],
  ['Avenida dos Caídos', ['Colosso do Viaduto', 'Patrulheiro Esmagado']],
  ['Complexo Helix', ['Protótipo H-08', 'Matriz de Contenção']],
  ['Necrópole Industrial', ['Titã da Forja Morta', 'Engenho de Carne']],
  ['Marco Zero', ['O Primeiro Infectado', 'Coração da Ruína Carmesim']],
] as const;

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildLootTable(tier: number) {
  const xp = 600 * tier + tier * tier * 120;
  const goldMin = 180 * tier;
  const goldMax = 280 * tier + tier * tier * 20;

  return [
    {
      rewardType: WorldBossRewardType.XP,
      minQuantity: xp,
      maxQuantity: Math.floor(xp * 1.18),
      chance: 100,
      guaranteed: true,
      requiresMinParticipation: true,
      sortOrder: 0,
    },
    {
      rewardType: WorldBossRewardType.GOLD,
      minQuantity: goldMin,
      maxQuantity: goldMax,
      chance: 100,
      guaranteed: true,
      requiresMinParticipation: true,
      sortOrder: 1,
    },
    {
      rewardType: WorldBossRewardType.MATERIAL,
      itemName: `Fragmento de Ameaça T${tier}`,
      minQuantity: Math.max(2, tier),
      maxQuantity: 4 + tier * 2,
      chance: 75,
      guaranteed: false,
      requiresMinParticipation: true,
      rarity: tier >= 7 ? Rarity.EPIC : tier >= 4 ? Rarity.RARE : Rarity.UNCOMMON,
      sortOrder: 2,
    },
    {
      rewardType: WorldBossRewardType.PET_EGG,
      itemName: `Casulo Infectado T${tier}`,
      minQuantity: 1,
      maxQuantity: 1,
      chance: Math.min(3.5, 0.8 + tier * 0.18),
      guaranteed: false,
      onlyIfDefeated: true,
      requiresMinParticipation: true,
      minContributionPercent: 0.25,
      rarity: Rarity.LEGENDARY,
      sortOrder: 10,
    },
  ];
}

export const worldBossDefinitions: WorldBossSeedData[] = bossNamesByTier.flatMap(
  ([mapName, names], tierIndex) => {
    const tier = tierIndex + 1;
    const minLevel = (tier - 1) * 10 + 1;
    const maxLevel = tier * 10;
    const baseHp = 120_000 * tier * tier;

    return names.map((name, index) => ({
      name,
      slug: slugify(`${mapName}-${name}`),
      description: `${name} concentra uma horda mutante em ${mapName}. Sobreviventes do tier ${tier} precisam conter a ameaça antes que ela se espalhe.`,
      mapName,
      tier,
      minLevel,
      maxLevel,
      baseHp: Math.floor(baseHp * (index === 0 ? 1 : 1.16)),
      maxHp: Math.floor(baseHp * 5.5),
      hpPerParticipant: 24_000 * tier,
      powerScalingFactor: 120 * tier,
      scalingFactor: index === 0 ? 1 : 1.08,
      minParticipantsExpected: 3,
      maxScalingCap: 3.2,
      scalingWindowSeconds: SCALING_WINDOW_SECONDS,
      attackPower: 45 * tier + index * 12,
      defense: 18 * tier + index * 6,
      resistance: 10 * tier + index * 5,
      mutationLevel: tier + index,
      damageReduction: Math.min(0.35, 0.04 + tier * 0.018 + index * 0.01),
      enrageMultiplier: 1.1 + tier * 0.025,
      durationSeconds: EVENT_DURATION_SECONDS,
      difficulty: index === 0 ? 'CONTENCAO' : 'EXTERMINIO',
      riskLevel: Math.min(10, tier + index + 1),
      minParticipationSeconds: 5 * 60,
      minParticipationDamage: 800 * tier,
      assetKey: slugify(name),
      isActive: true,
      sortOrder: tier * 10 + index,
      lootTable: buildLootTable(tier),
    }));
  },
);
