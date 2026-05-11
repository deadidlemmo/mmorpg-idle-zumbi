import {
  calculateLevelBonusStatsByClass,
  getClassHpBonus,
} from './level-stats.util';

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
  strengthBonus?: number | null;
  vitalityBonus?: number | null;
  agilityBonus?: number | null;
  precisionBonus?: number | null;
  techniqueBonus?: number | null;
  willpowerBonus?: number | null;
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
  return equipmentItems.filter(Boolean).reduce(
    (total, item) => {
      return {
        strength: total.strength + (item?.strengthBonus ?? 0),
        vitality: total.vitality + (item?.vitalityBonus ?? 0),
        agility: total.agility + (item?.agilityBonus ?? 0),
        precision: total.precision + (item?.precisionBonus ?? 0),
        technique: total.technique + (item?.techniqueBonus ?? 0),
        willpower: total.willpower + (item?.willpowerBonus ?? 0),
      };
    },
    createEmptyPrimaryStats(),
  );
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
      attack = stats.technique + stats.precision;
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
) {
  const safeLevel = Math.max(1, level);

  const basePrimaryStats = getBasePrimaryStats(gameClass);

  const levelBonusStats = getLevelPrimaryBonus(gameClass.name, safeLevel);

  const equipmentBonusStats = getEquipmentPrimaryBonus(equipmentItems);

  const totalPrimaryStats = sumManyPrimaryStats([
    basePrimaryStats,
    levelBonusStats,
    equipmentBonusStats,
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
    totalPrimaryStats,
    derivedCombatStats,
  };
}