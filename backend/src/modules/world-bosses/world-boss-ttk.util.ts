import type {
  DerivedCombatStats,
  EquipmentProgression,
  PrimaryStats,
} from '../../common/utils/stats.util';

export const WORLD_BOSS_TTK_BALANCE_VERSION = 2;
export const WORLD_BOSS_TTK_PARTICIPANT_COUNTS = [1, 2, 3, 5, 10] as const;

export type WorldBossTtkDifficulty = 'CONTENCAO' | 'EXTERMINIO';

const TARGET_TTK_SECONDS_BY_DIFFICULTY = Object.freeze({
  CONTENCAO: {
    solo: 45 * 60,
    duo: 35 * 60,
    smallGroup: 30 * 60,
    largeGroup: 25 * 60,
  },
  EXTERMINIO: {
    solo: 60 * 60,
    duo: 48 * 60,
    smallGroup: 40 * 60,
    largeGroup: 35 * 60,
  },
} as const);

const MIN_READINESS_RATIO = 0.25;
const MAX_READINESS_RATIO = 1.25;
const COMPLETE_LOADOUT_PIECES = 6;

export type WorldBossCombatStats = {
  characterLevel: number;
  primaryStats: PrimaryStats;
  derivedStats: DerivedCombatStats;
};

export type WorldBossDamageProfile = {
  defense: number;
  resistance: number;
  damageReduction: number;
};

export type WorldBossParticipantSnapshot = {
  powerScore: number;
  damagePerSecond: number;
  scalingDamagePerSecond: number;
  readinessRatio: number;
  equipmentTier: number;
  equippedPieceCount: number;
};

export type WorldBossDamageTickParticipant = {
  id: string;
  damagePerSecond: number;
  damageRemainder: number;
};

export type WorldBossDamageTickAllocation = {
  id: string;
  damage: number;
  damageRemainder: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeWorldBossDifficulty(
  difficulty: string | null | undefined,
): WorldBossTtkDifficulty {
  return String(difficulty ?? '')
    .trim()
    .toUpperCase() === 'EXTERMINIO'
    ? 'EXTERMINIO'
    : 'CONTENCAO';
}

export function getWorldBossTargetTtkSeconds(
  difficulty: string | null | undefined,
  participantCount: number,
) {
  const profile =
    TARGET_TTK_SECONDS_BY_DIFFICULTY[normalizeWorldBossDifficulty(difficulty)];
  const safeCount = Math.max(1, Math.floor(participantCount));

  if (safeCount <= 1) return profile.solo;
  if (safeCount === 2) return profile.duo;
  if (safeCount <= 5) return profile.smallGroup;
  return profile.largeGroup;
}

export function calculateWorldBossPowerScore(stats: WorldBossCombatStats) {
  const primary = stats.primaryStats;
  const derived = stats.derivedStats;

  return Math.max(
    1,
    Math.round(
      Math.max(1, stats.characterLevel) * 12 +
        derived.attack * 2 +
        derived.speed +
        derived.defense +
        primary.technique +
        primary.willpower,
    ),
  );
}

export function calculateWorldBossDamagePerSecond(params: {
  powerScore: number;
  boss: WorldBossDamageProfile;
}) {
  const safePowerScore = Math.max(1, params.powerScore);
  const defense = Math.max(0, params.boss.defense);
  const mitigation = clamp(
    Math.max(0, params.boss.damageReduction) +
      defense / Math.max(1, defense + safePowerScore * 8) +
      Math.max(0, params.boss.resistance) / 1000,
    0,
    0.82,
  );
  const damagePerMinute = Math.max(8, safePowerScore * 3.2 * (1 - mitigation));

  return damagePerMinute / 60;
}

export function calculateWorldBossReadinessRatio(params: {
  bossTier: number;
  bossLevel: number;
  characterLevel: number;
  equipmentProgression: EquipmentProgression;
  equippedPieceCount: number;
}) {
  const bossTier = Math.max(1, Math.floor(params.bossTier));
  const equipmentTier = Math.max(
    0,
    Number(params.equipmentProgression.effectiveTier) || 0,
  );
  const tierGap = bossTier - equipmentTier;
  let tierRatio: number;

  if (tierGap <= 0) {
    tierRatio = 1 + Math.min(0.2, Math.abs(tierGap) * 0.08);
  } else if (tierGap <= 1) {
    tierRatio = 0.8;
  } else if (tierGap <= 2) {
    tierRatio = 0.58;
  } else {
    tierRatio = Math.max(0.32, 0.58 - (tierGap - 2) * 0.1);
  }

  const pieceRatio =
    clamp(Math.floor(params.equippedPieceCount), 0, COMPLETE_LOADOUT_PIECES) /
    COMPLETE_LOADOUT_PIECES;
  const completenessRatio = 0.5 + pieceRatio * 0.5;
  const levelDelta = Math.max(
    0,
    Math.floor(params.characterLevel) - Math.floor(params.bossLevel),
  );
  const levelRatio = 1 + Math.min(0.12, levelDelta * 0.015);

  return clamp(
    tierRatio * completenessRatio * levelRatio,
    MIN_READINESS_RATIO,
    MAX_READINESS_RATIO,
  );
}

export function createWorldBossParticipantSnapshot(params: {
  bossTier: number;
  bossLevel: number;
  characterLevel: number;
  equipmentProgression: EquipmentProgression;
  equippedPieceCount: number;
  primaryStats: PrimaryStats;
  derivedStats: DerivedCombatStats;
  boss: WorldBossDamageProfile;
}): WorldBossParticipantSnapshot {
  const powerScore = calculateWorldBossPowerScore({
    characterLevel: params.characterLevel,
    primaryStats: params.primaryStats,
    derivedStats: params.derivedStats,
  });
  const damagePerSecond = calculateWorldBossDamagePerSecond({
    powerScore,
    boss: params.boss,
  });
  const readinessRatio = calculateWorldBossReadinessRatio(params);

  return {
    powerScore,
    damagePerSecond,
    scalingDamagePerSecond: damagePerSecond / readinessRatio,
    readinessRatio,
    equipmentTier: Math.max(
      0,
      Number(params.equipmentProgression.effectiveTier) || 0,
    ),
    equippedPieceCount: clamp(
      Math.floor(params.equippedPieceCount),
      0,
      COMPLETE_LOADOUT_PIECES,
    ),
  };
}

export function calculateWorldBossHpFromTtk(params: {
  targetTtkSeconds: number;
  scalingDamagePerSecond: readonly number[];
}) {
  const aggregateScalingDps = params.scalingDamagePerSecond.reduce(
    (total, dps) => total + Math.max(0, Number(dps) || 0),
    0,
  );

  return Math.max(
    1,
    Math.round(
      Math.max(1, Math.floor(params.targetTtkSeconds)) * aggregateScalingDps,
    ),
  );
}

export function calculateProjectedWorldBossTtkSeconds(params: {
  hp: number;
  damagePerSecond: readonly number[];
}) {
  const aggregateDps = params.damagePerSecond.reduce(
    (total, dps) => total + Math.max(0, Number(dps) || 0),
    0,
  );

  if (aggregateDps <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, params.hp) / aggregateDps;
}

export function calculateWorldBossDamageTick(params: {
  participants: readonly WorldBossDamageTickParticipant[];
  elapsedSeconds: number;
  currentHp: number;
}): WorldBossDamageTickAllocation[] {
  const elapsedSeconds = Math.max(0, Number(params.elapsedSeconds) || 0);
  const currentHp = Math.max(0, Math.floor(params.currentHp));
  if (elapsedSeconds <= 0 || currentHp <= 0) {
    return params.participants.map((participant) => ({
      id: participant.id,
      damage: 0,
      damageRemainder: Math.max(0, participant.damageRemainder),
    }));
  }

  const exactRows = params.participants.map((participant, index) => {
    const exactDamage =
      Math.max(0, participant.damagePerSecond) * elapsedSeconds +
      Math.max(0, participant.damageRemainder);
    const damage = Math.floor(exactDamage);

    return {
      id: participant.id,
      index,
      exactDamage,
      damage,
      fraction: exactDamage - damage,
    };
  });
  const totalDamage = exactRows.reduce((total, row) => total + row.damage, 0);

  if (totalDamage <= currentHp) {
    return exactRows.map((row) => ({
      id: row.id,
      damage: row.damage,
      damageRemainder: row.fraction,
    }));
  }

  const exactTotal = exactRows.reduce(
    (total, row) => total + row.exactDamage,
    0,
  );
  const cappedRows = exactRows.map((row) => {
    const exactShare =
      exactTotal > 0 ? (row.exactDamage / exactTotal) * currentHp : 0;
    const damage = Math.floor(exactShare);
    return {
      ...row,
      damage,
      shareFraction: exactShare - damage,
    };
  });
  let remaining =
    currentHp - cappedRows.reduce((total, row) => total + row.damage, 0);

  cappedRows
    .slice()
    .sort(
      (left, right) =>
        right.shareFraction - left.shareFraction || left.index - right.index,
    )
    .forEach((row) => {
      if (remaining <= 0) return;
      row.damage += 1;
      remaining -= 1;
    });

  return cappedRows
    .sort((left, right) => left.index - right.index)
    .map((row) => ({
      id: row.id,
      damage: row.damage,
      damageRemainder: 0,
    }));
}
