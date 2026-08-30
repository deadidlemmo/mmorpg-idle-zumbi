import {
  calculateLevelBonusStatsByClass,
  getClassHpBonus,
} from './level-stats.util';
import { getGatheringStatBonus } from '../config/gathering.config';

export type PrimaryStats = {
  strength: number;
  vitality: number;
  agility: number;
  precision: number;
  technique: number;
  willpower: number;
};

export type DerivedCombatStats = {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
};

type GameClassStats = {
  name: string;
  baseStrength: number;
  baseVitality: number;
  baseAgility: number;
  basePrecision: number;
  baseTechnique: number;
  baseWillpower: number;
};

type ItemStatsBonus = {
  tier?: number | null;
  enhancementLevel?: number | null;
  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;
};

type GatheringSkillStatsBonus = {
  origin?: string | null;
  level?: number | null;
};

type PrimaryStatsInput = Partial<PrimaryStats> | null | undefined;

export type EquipmentProgression = {
  craftedPieces: number;
  coherentPieces: number;
  coherentTier: number;
  averageTier: number;
  effectiveTier: number;
  averageEnhancementLevel: number;
  activeMilestone: number;
  nextMilestone: number | null;
  bonusPercent: number;
};

export const EQUIPMENT_PROGRESSION_MILESTONES = [
  { pieces: 2, bonusPercent: 4 },
  { pieces: 4, bonusPercent: 8 },
  { pieces: 6, bonusPercent: 12 },
] as const;

export const EQUIPMENT_REINFORCEMENT_EFFECTIVE_TIER_STEP = 0.25;

const GATHERING_STAT_BY_ORIGIN: Record<string, keyof PrimaryStats> = {
  DESMANCHE: 'strength',
  COLETA: 'vitality',
  PATRULHA: 'agility',
  ARSENAL: 'precision',
  TECNOVARREDURA: 'technique',
  CONTENCAO: 'willpower',
};

export function createEmptyPrimaryStats(): PrimaryStats {
  return {
    strength: 0,
    vitality: 0,
    agility: 0,
    precision: 0,
    technique: 0,
    willpower: 0,
  };
}

function normalizePrimaryStats(stats?: PrimaryStatsInput): PrimaryStats {
  return {
    strength: Math.max(0, Math.floor(Number(stats?.strength ?? 0))),
    vitality: Math.max(0, Math.floor(Number(stats?.vitality ?? 0))),
    agility: Math.max(0, Math.floor(Number(stats?.agility ?? 0))),
    precision: Math.max(0, Math.floor(Number(stats?.precision ?? 0))),
    technique: Math.max(0, Math.floor(Number(stats?.technique ?? 0))),
    willpower: Math.max(0, Math.floor(Number(stats?.willpower ?? 0))),
  };
}

export function calculateGatheringPrimaryBonus(
  gatheringSkills?: Array<GatheringSkillStatsBonus | null | undefined> | null,
): PrimaryStats {
  return (gatheringSkills ?? []).reduce((total, skill) => {
    const stat = GATHERING_STAT_BY_ORIGIN[String(skill?.origin ?? '')];

    if (!stat) {
      return total;
    }

    total[stat] += getGatheringStatBonus(Number(skill?.level ?? 1));

    return total;
  }, createEmptyPrimaryStats());
}

/**
 * Esses são os atributos base do personagem no nível 1.
 *
 * Importante:
 * Agora o seed deve gravar 30 pontos totais por classe:
 *
 * Principais: 8 + 8
 * Secundários: 5 + 5
 * Não usados: 2 + 2
 */
export function getBasePrimaryStats(gameClass: GameClassStats): PrimaryStats {
  return {
    strength: gameClass.baseStrength,
    vitality: gameClass.baseVitality,
    agility: gameClass.baseAgility,
    precision: gameClass.basePrecision,
    technique: gameClass.baseTechnique,
    willpower: gameClass.baseWillpower,
  };
}

/**
 * Bônus automático ganho por level.
 *
 * Level 1: não ganha bônus adicional.
 * Level 2: +2/+2 principais e +1/+1 secundários.
 * Level 50: aplica 49 vezes esse ganho.
 */
export function getLevelPrimaryBonus(
  className: string,
  level: number,
): PrimaryStats {
  const safeLevel = Math.max(1, level);

  return calculateLevelBonusStatsByClass(className, safeLevel);
}

export function getEquipmentPrimaryBonus(
  equipmentItems: Array<ItemStatsBonus | null | undefined>,
): PrimaryStats {
  return equipmentItems.filter(Boolean).reduce((total, item) => {
    return {
      strength: total.strength + (item?.strengthBonus ?? 0),
      vitality: total.vitality + (item?.vitalityBonus ?? 0),
      agility: total.agility + (item?.agilityBonus ?? 0),
      precision: total.precision + (item?.precisionBonus ?? 0),
      technique: total.technique + (item?.techniqueBonus ?? 0),
      willpower: total.willpower + (item?.willpowerBonus ?? 0),
    };
  }, createEmptyPrimaryStats());
}

export function getEquipmentProgression(
  equipmentItems: Array<ItemStatsBonus | null | undefined>,
): EquipmentProgression {
  const craftedItems = equipmentItems
    .filter((item): item is ItemStatsBonus => Number(item?.tier ?? 0) >= 1)
    .slice(0, 6);
  const craftedPieces = craftedItems.length;
  const tierCounts = new Map<number, number>();

  for (const item of craftedItems) {
    const tier = Math.max(1, Math.floor(Number(item.tier) || 1));
    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
  }

  const coherentEntry = Array.from(tierCounts.entries()).sort(
    ([leftTier, leftCount], [rightTier, rightCount]) =>
      rightCount - leftCount || rightTier - leftTier,
  )[0];
  const coherentTier = coherentEntry?.[0] ?? 0;
  const coherentPieces = coherentEntry?.[1] ?? 0;
  const averageTier =
    craftedItems.reduce(
      (total, item) => total + Math.max(1, Math.floor(Number(item.tier) || 1)),
      0,
    ) / 6;
  const averageEnhancementLevel =
    craftedItems.reduce(
      (total, item) =>
        total + Math.max(0, Math.floor(Number(item.enhancementLevel) || 0)),
      0,
    ) / 6;
  const effectiveTier =
    averageTier +
    averageEnhancementLevel * EQUIPMENT_REINFORCEMENT_EFFECTIVE_TIER_STEP;
  const activeMilestone = [...EQUIPMENT_PROGRESSION_MILESTONES]
    .reverse()
    .find((milestone) => coherentPieces >= milestone.pieces);
  const nextMilestone = EQUIPMENT_PROGRESSION_MILESTONES.find(
    (milestone) => coherentPieces < milestone.pieces,
  );

  return {
    craftedPieces,
    coherentPieces,
    coherentTier,
    averageTier: Number(averageTier.toFixed(2)),
    effectiveTier: Number(effectiveTier.toFixed(2)),
    averageEnhancementLevel: Number(averageEnhancementLevel.toFixed(2)),
    activeMilestone: activeMilestone?.pieces ?? 0,
    nextMilestone: nextMilestone?.pieces ?? null,
    bonusPercent: activeMilestone?.bonusPercent ?? 0,
  };
}

function applyEquipmentProgressionBonus(
  stats: PrimaryStats,
  progression: EquipmentProgression,
): PrimaryStats {
  if (progression.bonusPercent <= 0) {
    return stats;
  }

  const multiplier = 1 + progression.bonusPercent / 100;

  return {
    strength: Math.round(stats.strength * multiplier),
    vitality: Math.round(stats.vitality * multiplier),
    agility: Math.round(stats.agility * multiplier),
    precision: Math.round(stats.precision * multiplier),
    technique: Math.round(stats.technique * multiplier),
    willpower: Math.round(stats.willpower * multiplier),
  };
}

export function sumPrimaryStats(
  baseStats: PrimaryStats,
  bonusStats: PrimaryStats,
): PrimaryStats {
  return {
    strength: baseStats.strength + bonusStats.strength,
    vitality: baseStats.vitality + bonusStats.vitality,
    agility: baseStats.agility + bonusStats.agility,
    precision: baseStats.precision + bonusStats.precision,
    technique: baseStats.technique + bonusStats.technique,
    willpower: baseStats.willpower + bonusStats.willpower,
  };
}

export function sumManyPrimaryStats(statsList: PrimaryStats[]): PrimaryStats {
  return statsList.reduce(
    (total, stats) => sumPrimaryStats(total, stats),
    createEmptyPrimaryStats(),
  );
}

/**
 * Fórmulas derivadas de combate.
 *
 * maxHp não depende só de Vitalidade.
 * Isso é importante porque Assassino e Atirador não escalam Vitalidade por level.
 *
 * Fórmula:
 * maxHp = 120 + ((level - 1) * 12) + vitality * 6 + willpower * 3 + bônus da classe
 */
export function calculateDerivedCombatStats(
  className: string,
  level: number,
  stats: PrimaryStats,
): DerivedCombatStats {
  const safeLevel = Math.max(1, level);

  const normalizedClassName = className
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const classHpBonus = getClassHpBonus(className);

  const maxHp =
    120 +
    (safeLevel - 1) * 12 +
    stats.vitality * 6 +
    stats.willpower * 3 +
    classHpBonus;

  const defense = stats.vitality + stats.willpower;
  const speed = stats.agility;

  let attack: number;

  switch (normalizedClassName) {
    case 'lutador':
      attack = stats.strength * 2;
      break;

    case 'atirador':
      attack = stats.precision * 2;
      break;

    case 'assassino':
      attack = stats.agility + stats.precision;
      break;

    case 'medico':
      attack = stats.technique * 1.5 + stats.precision;
      break;

    default:
      attack = stats.strength + stats.precision;
      break;
  }

  return {
    maxHp,
    attack,
    defense,
    speed,
  };
}

/**
 * Calcula o pacote completo de atributos.
 *
 * level é opcional para não quebrar chamadas antigas imediatamente.
 * Mas, daqui para frente, o ideal é sempre chamar passando character.level.
 */
export function calculateFullStats(
  gameClass: GameClassStats,
  equipmentItems: Array<ItemStatsBonus | null | undefined>,
  level = 1,
  gatheringBonus?: PrimaryStatsInput,
) {
  const safeLevel = Math.max(1, level);

  const basePrimaryStats = getBasePrimaryStats(gameClass);

  const levelBonusStats = getLevelPrimaryBonus(gameClass.name, safeLevel);

  const equipmentProgression = getEquipmentProgression(equipmentItems);
  const coherentEquipmentItems = equipmentItems.filter(
    (item) =>
      equipmentProgression.coherentTier > 0 &&
      Math.floor(Number(item?.tier) || 0) === equipmentProgression.coherentTier,
  );
  const otherEquipmentItems = equipmentItems.filter(
    (item) =>
      Math.floor(Number(item?.tier) || 0) !== equipmentProgression.coherentTier,
  );
  const equipmentBonusStats = sumPrimaryStats(
    applyEquipmentProgressionBonus(
      getEquipmentPrimaryBonus(coherentEquipmentItems),
      equipmentProgression,
    ),
    getEquipmentPrimaryBonus(otherEquipmentItems),
  );
  const gatheringBonusStats = normalizePrimaryStats(gatheringBonus);

  const totalPrimaryStats = sumManyPrimaryStats([
    basePrimaryStats,
    levelBonusStats,
    equipmentBonusStats,
    gatheringBonusStats,
  ]);

  const derivedCombatStats = calculateDerivedCombatStats(
    gameClass.name,
    safeLevel,
    totalPrimaryStats,
  );

  return {
    level: safeLevel,
    basePrimaryStats,
    levelBonusStats,
    equipmentBonusStats,
    gatheringBonusStats,
    totalPrimaryStats,
    derivedCombatStats,
    equipmentProgression,
  };
}
