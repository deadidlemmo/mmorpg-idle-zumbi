import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ItemSlot } from '@prisma/client';
import type { EquipmentSeedData, MobSeedData } from '../prisma/seed-types';
import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import {
  equipmentDefinitions,
  starterEquipmentDefinitions,
} from '../prisma/seed-data/items.seed-data';
import {
  getActiveAutoCombatMobRank,
  mobBaseDefinitions,
  mobDefinitions,
} from '../prisma/seed-data/mobs.seed-data';
import {
  buildReinforcedEquipmentStats,
  PET_TIME_REDUCTION_BASIS_POINTS_BY_TIER,
  type EquipmentReinforcementSlot,
} from '../src/common/config/economy.config';
import { MIN_AUTO_COMBAT_TTK_DURATION_MS } from '../src/modules/auto-combat/auto-combat-ttk-cycle';
import { reduceDurationByBasisPoints } from '../src/modules/pets/pet-bonus';
import {
  applyAutoCombatIncomingDamageMultiplier,
  applyAutoCombatXpEfficiency,
  scaleAutoCombatGatheringBonus,
} from '../src/common/utils/auto-combat-balance.util';
import { getAutoCombatHuntingSecondsPerEnemy } from '../src/common/utils/auto-combat-hunting.util';
import { projectAutoCombatSurvival } from '../src/common/utils/auto-combat-survival.util';
import { calculateAutoCombatTtk } from '../src/common/utils/auto-combat-ttk.util';
import {
  applyXpPenalty,
  calculateTierFarmPenalty,
} from '../src/common/utils/farm-penalty.util';
import {
  calculateFullStats,
  calculateGatheringPrimaryBonus,
  type PrimaryStats,
} from '../src/common/utils/stats.util';
import { getVendorFixedBuyPrice } from '../src/common/config/vendor.config';
import { calculateAutoCombatPotionHeal } from './auto-combat-potion-balancing';

export type TierPosition = 'START' | 'MID' | 'END';
export type GearScenario = 'PREVIOUS' | 'MIXED' | 'CURRENT' | 'TWO_BELOW';
export type GatheringScenario = 'NONE' | 'RECOMMENDED' | 'FULL';
export type PetScenario = 'NONE' | 'CURRENT_TIER';
export type PotionScenario = 'NONE' | 'CURRENT_TIER';

type MatrixEquipmentItem = EquipmentSeedData & {
  enhancementLevel?: number;
};

export type MatrixRow = {
  tier: number;
  position: TierPosition;
  mobName: string;
  mobRank: number;
  mobLevel: number;
  className: string;
  gear: GearScenario;
  reinforcement: number;
  gathering: GatheringScenario;
  pet: PetScenario;
  potion: PotionScenario;
  characterLevel: number;
  equipmentTier: number;
  hp: number;
  attack: number;
  defense: number;
  baseTtkSeconds: number;
  ttkSeconds: number;
  ttkDeltaFromPetPercent: number;
  expectedAttacksPerKill: number;
  expectedDamagePerAttack: number;
  expectedDamagePerKill: number;
  incomingDamageMultiplier: number;
  safeKillsWithoutPotions: number;
  safeKillsWithPotions: number;
  potionName: string;
  potionItemTier: number;
  potionMinTier: number;
  potionMaxTier: number;
  potionHealAmount: number;
  potionBuyPrice: number;
  killsResolvedInProjection: number;
  potionsUsedInProjection: number;
  potionsPer100Kills: number;
  potionGoldPer100Kills: number;
  defeatsInProjection: number;
  defeatedAtKill: number | null;
  riskLevel: string;
  survives100Kills: boolean;
  huntingSecondsPerEnemy: number;
  killsPerHour: number;
  effectiveXpPerHour: number;
};

type ValidationResult = {
  key: string;
  passed: boolean;
  message: string;
};

const TIER_POSITIONS: ReadonlyArray<{
  position: TierPosition;
  rank: number;
}> = [
  { position: 'START', rank: 1 },
  { position: 'MID', rank: 3 },
  { position: 'END', rank: 6 },
];
const SLOT_ORDER = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;
const MIXED_CURRENT_SLOTS = new Set<ItemSlot>([
  ItemSlot.MAIN_HAND,
  ItemSlot.HEAD,
  ItemSlot.PANTS,
]);
const GATHERING_ORIGINS = [
  'DESMANCHE',
  'COLETA',
  'PATRULHA',
  'ARSENAL',
  'TECNOVARREDURA',
  'CONTENCAO',
] as const;
const RECOMMENDED_GATHERING_BY_CLASS: Record<string, string[]> = {
  lutador: ['DESMANCHE', 'COLETA', 'CONTENCAO'],
  assassino: ['PATRULHA', 'ARSENAL', 'DESMANCHE'],
  atirador: ['ARSENAL', 'TECNOVARREDURA', 'PATRULHA'],
  medico: ['TECNOVARREDURA', 'CONTENCAO', 'COLETA'],
};
const REINFORCEMENT_LEVELS = [0, 3] as const;
const GATHERING_SCENARIOS: GatheringScenario[] = [
  'NONE',
  'RECOMMENDED',
  'FULL',
];
const PET_SCENARIOS: PetScenario[] = ['NONE', 'CURRENT_TIER'];
const POTION_SCENARIOS: PotionScenario[] = ['NONE', 'CURRENT_TIER'];
const PROJECTED_KILLS = 100;
const PROJECTED_POTION_QUANTITY = 100;

function normalize(value: string) {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getLoadout(className: string, tier: number): MatrixEquipmentItem[] {
  const source = tier <= 0 ? starterEquipmentDefinitions : equipmentDefinitions;

  return SLOT_ORDER.flatMap((slot) => {
    const item = source.find(
      (candidate) =>
        normalize(candidate.className) === normalize(className) &&
        candidate.slot === slot &&
        (tier <= 0 ? candidate.tier <= 0 : candidate.tier === tier),
    );

    return item ? [item] : [];
  });
}

function getGearScenarios(tier: number): GearScenario[] {
  return tier >= 3
    ? ['PREVIOUS', 'MIXED', 'CURRENT', 'TWO_BELOW']
    : ['PREVIOUS', 'MIXED', 'CURRENT'];
}

function buildScenarioLoadout(params: {
  className: string;
  tier: number;
  gear: GearScenario;
}) {
  const current = getLoadout(params.className, params.tier);
  const previous = getLoadout(params.className, params.tier - 1);

  if (params.gear === 'CURRENT') return current;
  if (params.gear === 'PREVIOUS') return previous;
  if (params.gear === 'TWO_BELOW') {
    return getLoadout(params.className, params.tier - 2);
  }

  const currentBySlot = new Map(current.map((item) => [item.slot, item]));
  const previousBySlot = new Map(previous.map((item) => [item.slot, item]));

  return SLOT_ORDER.flatMap((slot) => {
    const item = MIXED_CURRENT_SLOTS.has(slot)
      ? currentBySlot.get(slot)
      : previousBySlot.get(slot);
    return item ? [item] : [];
  });
}

function reinforceLoadout(
  items: MatrixEquipmentItem[],
  reinforcement: number,
): MatrixEquipmentItem[] {
  return items.map((item) => {
    if (reinforcement <= 0 || item.tier <= 0) {
      return { ...item, enhancementLevel: 0 };
    }

    const reinforcedStats = buildReinforcedEquipmentStats(
      {
        strengthBonus: item.strengthBonus ?? 0,
        vitalityBonus: item.vitalityBonus ?? 0,
        agilityBonus: item.agilityBonus ?? 0,
        precisionBonus: item.precisionBonus ?? 0,
        techniqueBonus: item.techniqueBonus ?? 0,
        willpowerBonus: item.willpowerBonus ?? 0,
      },
      item.tier,
      item.slot as EquipmentReinforcementSlot,
      reinforcement,
    );

    return {
      ...item,
      ...reinforcedStats,
      enhancementLevel: reinforcement,
    };
  });
}

function buildGatheringBonus(params: {
  className: string;
  level: number;
  scenario: GatheringScenario;
}): PrimaryStats {
  if (params.scenario === 'NONE') {
    return calculateGatheringPrimaryBonus([]);
  }

  const origins =
    params.scenario === 'FULL'
      ? [...GATHERING_ORIGINS]
      : (RECOMMENDED_GATHERING_BY_CLASS[normalize(params.className)] ?? []);
  const skillLevel =
    params.scenario === 'FULL' ? 50 : Math.max(1, Math.min(50, params.level));

  return calculateGatheringPrimaryBonus(
    origins.map((origin) => ({ origin, level: skillLevel })),
  );
}

function getActiveMob(tier: number, rank: number): MobSeedData {
  const index = mobBaseDefinitions.findIndex(
    (baseMob) =>
      baseMob.tier === tier && getActiveAutoCombatMobRank(baseMob) === rank,
  );
  const mob = mobDefinitions[index];

  if (!mob) {
    throw new Error(`Mob ativo T${tier} rank ${rank} nao encontrado.`);
  }

  return mob;
}

function buildMatrixRow(params: {
  tier: number;
  position: TierPosition;
  rank: number;
  classDefinition: (typeof classDefinitions)[number];
  gear: GearScenario;
  reinforcement: number;
  gathering: GatheringScenario;
  pet: PetScenario;
  potion: PotionScenario;
}): MatrixRow {
  const mob = getActiveMob(params.tier, params.rank);
  const characterLevel = mob.level;
  const baseLoadout = buildScenarioLoadout({
    className: params.classDefinition.name,
    tier: params.tier,
    gear: params.gear,
  });
  const loadout = reinforceLoadout(baseLoadout, params.reinforcement);
  const gatheringBonus = buildGatheringBonus({
    className: params.classDefinition.name,
    level: characterLevel,
    scenario: params.gathering,
  });
  const visibleStats = calculateFullStats(
    params.classDefinition,
    loadout,
    characterLevel,
    gatheringBonus,
  );
  const combatStats = calculateFullStats(
    params.classDefinition,
    loadout,
    characterLevel,
    scaleAutoCombatGatheringBonus(gatheringBonus),
  );
  const playerStats = {
    className: params.classDefinition.name,
    attack: combatStats.derivedCombatStats.attack,
    speed: combatStats.derivedCombatStats.speed,
    precision: combatStats.totalPrimaryStats.precision,
    technique: combatStats.totalPrimaryStats.technique,
    agility: combatStats.totalPrimaryStats.agility,
    equipmentTier: combatStats.equipmentProgression.effectiveTier,
  };
  const ttk = calculateAutoCombatTtk({ mob, playerStats });
  const petBasisPoints =
    params.pet === 'CURRENT_TIER'
      ? PET_TIME_REDUCTION_BASIS_POINTS_BY_TIER[
          params.tier as keyof typeof PET_TIME_REDUCTION_BASIS_POINTS_BY_TIER
        ]
      : 0;
  const ttkMs = reduceDurationByBasisPoints(
    ttk.estimatedKillTimeSeconds * 1_000,
    petBasisPoints,
    MIN_AUTO_COMBAT_TTK_DURATION_MS,
  );
  const ttkSeconds = ttkMs / 1_000;
  const potionHeal = calculateAutoCombatPotionHeal({
    tier: params.tier,
    maxHp: visibleStats.derivedCombatStats.maxHp,
    className: params.classDefinition.name,
  });
  const potionBuyPrice = getVendorFixedBuyPrice(potionHeal.potion.name) ?? 0;
  const mobAttack = applyAutoCombatIncomingDamageMultiplier({
    attack: mob.attack,
    className: params.classDefinition.name,
  });
  const survival = projectAutoCombatSurvival({
    currentHp: visibleStats.derivedCombatStats.maxHp,
    maxHp: visibleStats.derivedCombatStats.maxHp,
    playerDefense: combatStats.derivedCombatStats.defense,
    playerAgility: combatStats.totalPrimaryStats.agility,
    mobAttack,
    mobPrecision: mob.speed,
    mobTechnique: mob.level,
    mobSpeed: mob.speed,
    mobTier: mob.tier,
    equipmentTier: combatStats.equipmentProgression.effectiveTier,
    killTimeSeconds: ttkSeconds,
    projectedKills: PROJECTED_KILLS,
    potion:
      params.potion === 'CURRENT_TIER'
        ? {
            availableQuantity: PROJECTED_POTION_QUANTITY,
            healAmount: potionHeal.healAmount,
            hpThresholdPercent: 35,
          }
        : null,
  });
  const huntingLevel = Math.max(1, Math.min(50, characterLevel));
  const huntingSecondsPerEnemy =
    getAutoCombatHuntingSecondsPerEnemy(huntingLevel);
  const killsPerHour = 3_600 / Math.max(1, huntingSecondsPerEnemy + ttkSeconds);
  const farmPenalty = calculateTierFarmPenalty(characterLevel, mob.tier);
  const baseXp = applyXpPenalty(mob.xpReward, farmPenalty.xpMultiplier);
  const effectiveXp = applyAutoCombatXpEfficiency({
    baseXp,
    className: params.classDefinition.name,
    riskLevel: survival.riskLevel,
  });
  const defeatedAtKill = survival.willSurviveProjection
    ? null
    : Math.min(PROJECTED_KILLS, survival.safeKillsWithPotions + 1);
  const killsResolvedInProjection = defeatedAtKill ?? PROJECTED_KILLS;
  const potionsPer100Kills = round(
    (survival.expectedPotionsUsed / Math.max(1, killsResolvedInProjection)) *
      100,
  );

  return {
    tier: params.tier,
    position: params.position,
    mobName: mob.name,
    mobRank: params.rank,
    mobLevel: mob.level,
    className: params.classDefinition.name,
    gear: params.gear,
    reinforcement: params.reinforcement,
    gathering: params.gathering,
    pet: params.pet,
    potion: params.potion,
    characterLevel,
    equipmentTier: combatStats.equipmentProgression.effectiveTier,
    hp: visibleStats.derivedCombatStats.maxHp,
    attack: combatStats.derivedCombatStats.attack,
    defense: combatStats.derivedCombatStats.defense,
    baseTtkSeconds: ttk.estimatedKillTimeSeconds,
    ttkSeconds,
    ttkDeltaFromPetPercent: round(
      (1 - ttkSeconds / ttk.estimatedKillTimeSeconds) * 100,
    ),
    expectedAttacksPerKill: survival.expectedAttacksPerKill,
    expectedDamagePerAttack: survival.expectedDamagePerAttack,
    expectedDamagePerKill: survival.expectedDamagePerKill,
    incomingDamageMultiplier: survival.incomingDamageMultiplier,
    safeKillsWithoutPotions: survival.safeKillsWithoutPotions,
    safeKillsWithPotions: survival.safeKillsWithPotions,
    potionName: potionHeal.potion.name,
    potionItemTier: potionHeal.potion.tier,
    potionMinTier: potionHeal.potion.minTier,
    potionMaxTier: potionHeal.potion.maxTier,
    potionHealAmount: potionHeal.healAmount,
    potionBuyPrice,
    killsResolvedInProjection,
    potionsUsedInProjection: survival.expectedPotionsUsed,
    potionsPer100Kills,
    potionGoldPer100Kills: round(potionsPer100Kills * potionBuyPrice),
    defeatsInProjection: survival.willSurviveProjection ? 0 : 1,
    defeatedAtKill,
    riskLevel: survival.riskLevel,
    survives100Kills: survival.willSurviveProjection,
    huntingSecondsPerEnemy,
    killsPerHour: round(killsPerHour),
    effectiveXpPerHour: round(killsPerHour * effectiveXp),
  };
}

function getTierPositionByRank(rank: number): TierPosition {
  if (rank >= 1 && rank <= 2) return 'START';
  if (rank >= 3 && rank <= 4) return 'MID';
  if (rank >= 5 && rank <= 6) return 'END';

  throw new Error(`Rank ativo invalido: ${rank}.`);
}

export function buildAutoCombatMobRow(params: {
  tier: number;
  rank: number;
  className: string;
  gear?: GearScenario;
  reinforcement?: number;
  gathering?: GatheringScenario;
  pet?: PetScenario;
  potion?: PotionScenario;
}): MatrixRow {
  const classDefinition = classDefinitions.find(
    (candidate) => normalize(candidate.name) === normalize(params.className),
  );

  if (!classDefinition) {
    throw new Error(`Classe nao encontrada: ${params.className}.`);
  }

  if (!Number.isInteger(params.tier) || params.tier < 1 || params.tier > 5) {
    throw new Error(`Tier fora da faixa de lancamento: ${params.tier}.`);
  }

  return buildMatrixRow({
    tier: params.tier,
    position: getTierPositionByRank(params.rank),
    rank: params.rank,
    classDefinition,
    gear: params.gear ?? 'CURRENT',
    reinforcement: params.reinforcement ?? 0,
    gathering: params.gathering ?? 'RECOMMENDED',
    pet: params.pet ?? 'NONE',
    potion: params.potion ?? 'CURRENT_TIER',
  });
}

export function buildCurrentSetAutoCombatMobRow(params: {
  tier: number;
  rank: number;
  className: string;
}): MatrixRow {
  return buildAutoCombatMobRow(params);
}

export function buildAutoCombatTierMatrix(): MatrixRow[] {
  const rows: MatrixRow[] = [];

  for (let tier = 1; tier <= 5; tier++) {
    for (const { position, rank } of TIER_POSITIONS) {
      for (const classDefinition of classDefinitions) {
        for (const gear of getGearScenarios(tier)) {
          for (const reinforcement of REINFORCEMENT_LEVELS) {
            const unreinforcedLoadout = buildScenarioLoadout({
              className: classDefinition.name,
              tier,
              gear,
            });
            const canReinforce = unreinforcedLoadout.some(
              (item) => item.tier > 0,
            );

            if (reinforcement > 0 && !canReinforce) continue;

            for (const gathering of GATHERING_SCENARIOS) {
              for (const pet of PET_SCENARIOS) {
                for (const potion of POTION_SCENARIOS) {
                  rows.push(
                    buildMatrixRow({
                      tier,
                      position,
                      rank,
                      classDefinition,
                      gear,
                      reinforcement,
                      gathering,
                      pet,
                      potion,
                    }),
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  return rows;
}

function findBaselineRow(
  rows: MatrixRow[],
  params: Pick<MatrixRow, 'tier' | 'position' | 'className' | 'gear'> &
    Partial<Pick<MatrixRow, 'potion'>>,
) {
  return rows.find(
    (row) =>
      row.tier === params.tier &&
      row.position === params.position &&
      row.className === params.className &&
      row.gear === params.gear &&
      row.reinforcement === 0 &&
      row.gathering === 'RECOMMENDED' &&
      row.pet === 'NONE' &&
      row.potion === (params.potion ?? 'NONE'),
  );
}

export function validateAutoCombatTierMatrix(rows: MatrixRow[]) {
  const results: ValidationResult[] = [];

  for (const classDefinition of classDefinitions) {
    const starter = findBaselineRow(rows, {
      tier: 1,
      position: 'START',
      className: classDefinition.name,
      gear: 'PREVIOUS',
      potion: 'CURRENT_TIER',
    });
    const tierOne = findBaselineRow(rows, {
      tier: 1,
      position: 'START',
      className: classDefinition.name,
      gear: 'CURRENT',
      potion: 'CURRENT_TIER',
    });

    results.push({
      key: `T1-${classDefinition.name}-starter-viability`,
      passed: Boolean(
        starter &&
        starter.survives100Kills &&
        starter.safeKillsWithoutPotions >= 25,
      ),
      message: starter
        ? `Aprendiz vence 100 com pocoes e ${starter.safeKillsWithoutPotions} sem pocao.`
        : 'Cenario de aprendiz ausente.',
    });
    results.push({
      key: `T1-${classDefinition.name}-crafted-upgrade`,
      passed: Boolean(
        starter &&
        tierOne &&
        tierOne.ttkSeconds < starter.ttkSeconds &&
        tierOne.expectedDamagePerKill < starter.expectedDamagePerKill,
      ),
      message:
        starter && tierOne
          ? `Set T1 reduz TTK ${starter.ttkSeconds}s -> ${tierOne.ttkSeconds}s e dano ${starter.expectedDamagePerKill} -> ${tierOne.expectedDamagePerKill}.`
          : 'Cenario de set T1 ausente.',
    });
  }

  for (let tier = 2; tier <= 5; tier++) {
    for (const classDefinition of classDefinitions) {
      const previousStart = findBaselineRow(rows, {
        tier,
        position: 'START',
        className: classDefinition.name,
        gear: 'PREVIOUS',
      });
      const currentStart = findBaselineRow(rows, {
        tier,
        position: 'START',
        className: classDefinition.name,
        gear: 'CURRENT',
      });

      if (!previousStart || !currentStart) {
        results.push({
          key: `T${tier}-${classDefinition.name}-coverage`,
          passed: false,
          message: 'Cenario inicial anterior/atual ausente.',
        });
        continue;
      }

      const ttkSlowdown =
        (previousStart.ttkSeconds / currentStart.ttkSeconds - 1) * 100;
      results.push({
        key: `T${tier}-${classDefinition.name}-ttk-transition`,
        passed: ttkSlowdown >= 15 && ttkSlowdown <= 25,
        message: `Set anterior ${round(ttkSlowdown, 1)}% mais lento no inicio do tier.`,
      });

      const damageRatio =
        previousStart.expectedDamagePerKill /
        Math.max(0.01, currentStart.expectedDamagePerKill);
      results.push({
        key: `T${tier}-${classDefinition.name}-damage-transition`,
        passed: damageRatio >= 1.5,
        message: `Set anterior recebe ${round(damageRatio, 2)}x o dano por abate inicial.`,
      });

      for (const position of ['MID', 'END'] as const) {
        const previous = findBaselineRow(rows, {
          tier,
          position,
          className: classDefinition.name,
          gear: 'PREVIOUS',
        });
        const current = findBaselineRow(rows, {
          tier,
          position,
          className: classDefinition.name,
          gear: 'CURRENT',
        });

        if (!previous || !current) continue;

        const positionDamageRatio =
          previous.expectedDamagePerKill /
          Math.max(0.01, current.expectedDamagePerKill);
        results.push({
          key: `T${tier}-${classDefinition.name}-${position.toLowerCase()}-risk`,
          passed:
            positionDamageRatio >= 1.5 &&
            previous.safeKillsWithoutPotions < current.safeKillsWithoutPotions,
          message: `${position}: dano ${round(positionDamageRatio, 2)}x; ${previous.safeKillsWithoutPotions}/${current.safeKillsWithoutPotions} abates seguros sem pocao.`,
        });
      }

      if (tier >= 3) {
        for (const position of ['START', 'MID', 'END'] as const) {
          const twoBelow = findBaselineRow(rows, {
            tier,
            position,
            className: classDefinition.name,
            gear: 'TWO_BELOW',
            potion: 'CURRENT_TIER',
          });

          if (twoBelow) {
            results.push({
              key: `T${tier}-${classDefinition.name}-two-below-${position.toLowerCase()}`,
              passed: !twoBelow.survives100Kills,
              message: `Dois tiers abaixo (${position}) chega ao abate ${twoBelow.defeatedAtKill ?? 100} com 100 pocoes.`,
            });
          }
        }
      }

      for (const position of ['START', 'MID', 'END'] as const) {
        const currentWithPotion = findBaselineRow(rows, {
          tier,
          position,
          className: classDefinition.name,
          gear: 'CURRENT',
          potion: 'CURRENT_TIER',
        });

        if (currentWithPotion) {
          results.push({
            key: `T${tier}-${classDefinition.name}-current-${position.toLowerCase()}-potion`,
            passed:
              currentWithPotion.survives100Kills &&
              currentWithPotion.potionsPer100Kills <= 100,
            message: `Set atual (${position}) usa ${currentWithPotion.potionsPer100Kills}/100 pocoes e ${currentWithPotion.survives100Kills ? 'sobrevive' : 'cai'}.`,
          });
        }
      }

      const previousReinforced = rows.find(
        (row) =>
          row.tier === tier &&
          row.position === 'START' &&
          row.className === classDefinition.name &&
          row.gear === 'PREVIOUS' &&
          row.reinforcement === 3 &&
          row.gathering === 'RECOMMENDED' &&
          row.pet === 'NONE' &&
          row.potion === 'NONE',
      );

      if (previousReinforced) {
        results.push({
          key: `T${tier}-${classDefinition.name}-reinforcement`,
          passed:
            previousReinforced.ttkSeconds < previousStart.ttkSeconds &&
            previousReinforced.expectedDamagePerKill <
              previousStart.expectedDamagePerKill,
          message: `+3 reduz TTK ${previousStart.ttkSeconds}s -> ${previousReinforced.ttkSeconds}s e dano ${previousStart.expectedDamagePerKill} -> ${previousReinforced.expectedDamagePerKill}.`,
        });
      }

      const currentWithPet = rows.find(
        (row) =>
          row.tier === tier &&
          row.position === 'START' &&
          row.className === classDefinition.name &&
          row.gear === 'CURRENT' &&
          row.reinforcement === 0 &&
          row.gathering === 'RECOMMENDED' &&
          row.pet === 'CURRENT_TIER' &&
          row.potion === 'NONE',
      );

      if (currentWithPet) {
        results.push({
          key: `T${tier}-${classDefinition.name}-pet`,
          passed:
            currentWithPet.ttkSeconds < currentStart.ttkSeconds &&
            currentWithPet.expectedDamagePerKill <
              currentStart.expectedDamagePerKill,
          message: `Pet reduz TTK ${currentStart.ttkSeconds}s -> ${currentWithPet.ttkSeconds}s e exposicao por abate.`,
        });
      }

      const mixedStart = findBaselineRow(rows, {
        tier,
        position: 'START',
        className: classDefinition.name,
        gear: 'MIXED',
      });

      if (mixedStart) {
        results.push({
          key: `T${tier}-${classDefinition.name}-mixed`,
          passed:
            mixedStart.ttkSeconds <= previousStart.ttkSeconds &&
            mixedStart.ttkSeconds >= currentStart.ttkSeconds &&
            mixedStart.expectedDamagePerKill <=
              previousStart.expectedDamagePerKill &&
            mixedStart.expectedDamagePerKill >=
              currentStart.expectedDamagePerKill,
          message: `Misto fica entre anterior e atual em TTK e dano.`,
        });
      }
    }
  }

  const carregadorRows = rows.filter(
    (row) =>
      row.mobName === 'Carregador de Paletes Infectado' &&
      row.className === 'Lutador' &&
      row.reinforcement === 0 &&
      row.gathering === 'RECOMMENDED' &&
      row.pet === 'NONE' &&
      row.potion === 'CURRENT_TIER' &&
      (row.gear === 'PREVIOUS' || row.gear === 'CURRENT'),
  );
  const carregadorT1 = carregadorRows.find((row) => row.gear === 'PREVIOUS');
  const carregadorT2 = carregadorRows.find((row) => row.gear === 'CURRENT');

  results.push({
    key: 'carregador-t2-t1-vs-t2-potions',
    passed: Boolean(
      carregadorT1 &&
      carregadorT2 &&
      carregadorT1.potionsPer100Kills > carregadorT2.potionsPer100Kills,
    ),
    message:
      carregadorT1 && carregadorT2
        ? `Carregador: ${carregadorT1.potionsPer100Kills} pocoes com T1 contra ${carregadorT2.potionsPer100Kills} com T2.`
        : 'Cenario do Carregador nao encontrado.',
  });

  for (let tier = 1; tier <= 5; tier++) {
    const potionRow = rows.find(
      (row) =>
        row.tier === tier &&
        row.position === 'START' &&
        row.className === 'Lutador' &&
        row.gear === 'CURRENT' &&
        row.reinforcement === 0 &&
        row.gathering === 'RECOMMENDED' &&
        row.pet === 'NONE' &&
        row.potion === 'CURRENT_TIER',
    );

    results.push({
      key: `T${tier}-potion-availability`,
      passed: Boolean(
        potionRow &&
        potionRow.potionName &&
        potionRow.potionMinTier <= tier &&
        potionRow.potionMaxTier >= tier &&
        potionRow.potionHealAmount > 0 &&
        potionRow.potionBuyPrice > 0,
      ),
      message: potionRow
        ? `${potionRow.potionName} (item T${potionRow.potionItemTier}, faixa T${potionRow.potionMinTier}-T${potionRow.potionMaxTier}): cura ${potionRow.potionHealAmount}, ${potionRow.potionBuyPrice} Gold cada.`
        : `Pocao recomendada para T${tier} nao encontrada.`,
    });
  }

  return results;
}

function buildTransitionSummary(rows: MatrixRow[]) {
  return Array.from({ length: 4 }, (_, index) => index + 2).map((tier) => {
    const comparisons = classDefinitions.flatMap((classDefinition) => {
      const previous = findBaselineRow(rows, {
        tier,
        position: 'START',
        className: classDefinition.name,
        gear: 'PREVIOUS',
      });
      const current = findBaselineRow(rows, {
        tier,
        position: 'START',
        className: classDefinition.name,
        gear: 'CURRENT',
      });
      return previous && current ? [{ previous, current }] : [];
    });
    const average = (values: number[]) =>
      values.reduce((total, value) => total + value, 0) /
      Math.max(1, values.length);

    return {
      tier: `T${tier}`,
      ttkAnteriorPercent: round(
        average(
          comparisons.map(
            ({ previous, current }) =>
              (previous.ttkSeconds / current.ttkSeconds - 1) * 100,
          ),
        ),
        1,
      ),
      danoAnteriorX: round(
        average(
          comparisons.map(
            ({ previous, current }) =>
              previous.expectedDamagePerKill /
              Math.max(0.01, current.expectedDamagePerKill),
          ),
        ),
        2,
      ),
      xpHoraAnteriorPercent: round(
        average(
          comparisons.map(
            ({ previous, current }) =>
              (previous.effectiveXpPerHour /
                Math.max(0.01, current.effectiveXpPerHour)) *
              100,
          ),
        ),
        1,
      ),
    };
  });
}

function toCsv(rows: MatrixRow[]) {
  const headers = Object.keys(rows[0] ?? {});
  const values = rows.map((row) =>
    headers
      .map((header) => {
        const value = row[header as keyof MatrixRow];
        if (value === null) return '';
        if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
        return String(value);
      })
      .join(','),
  );
  return [headers.join(','), ...values].join('\n');
}

function main() {
  const strict = process.argv.includes('--strict');
  const summaryOnly = process.argv.includes('--summary-only');
  const outputArg = process.argv.find((arg) => arg.startsWith('--output-dir='));
  const outputDir = outputArg?.slice('--output-dir='.length);
  const rows = buildAutoCombatTierMatrix();
  const validations = validateAutoCombatTierMatrix(rows);
  const failures = validations.filter((validation) => !validation.passed);

  console.log(`Matriz T1-T5: ${rows.length} cenarios calculados.`);
  console.table(buildTransitionSummary(rows));
  console.log(
    `Validacoes: ${validations.length - failures.length}/${validations.length} aprovadas.`,
  );

  if (failures.length > 0) {
    console.table(failures);
  } else if (!summaryOnly) {
    console.table(validations);
  }

  if (outputDir) {
    const absoluteOutputDir = resolve(outputDir);
    mkdirSync(absoluteOutputDir, { recursive: true });
    writeFileSync(
      resolve(absoluteOutputDir, 'auto-combat-t1-t5-matrix.csv'),
      toCsv(rows),
      'utf8',
    );
    writeFileSync(
      resolve(absoluteOutputDir, 'auto-combat-t1-t5-matrix.json'),
      JSON.stringify({ rows, validations }, null, 2),
      'utf8',
    );
    console.log(`Arquivos exportados em ${absoluteOutputDir}.`);
  }

  if (strict && failures.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
