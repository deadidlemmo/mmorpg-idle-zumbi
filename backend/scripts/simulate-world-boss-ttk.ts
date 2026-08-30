import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ItemSlot } from '@prisma/client';
import type { EquipmentSeedData } from '../prisma/seed-types';
import { classDefinitions } from '../prisma/seed-data/classes.seed-data';
import {
  equipmentDefinitions,
  starterEquipmentDefinitions,
} from '../prisma/seed-data/items.seed-data';
import { worldBossDefinitions } from '../prisma/seed-data/world-bosses.seed-data';
import {
  ECONOMY_ACTIVITY_REWARDS,
  ECONOMY_LAUNCH_TIERS,
  getPetRarityByTier,
  PET_DEFINITIONS,
} from '../src/common/config/economy.config';
import {
  getWorldBossRespawnSeconds,
  WORLD_BOSS_SCHEDULE_CONFIG,
} from '../src/common/config/world-boss.config';
import { calculateFullStats } from '../src/common/utils/stats.util';
import {
  calculateProjectedWorldBossTtkSeconds,
  calculateWorldBossHpFromTtk,
  createWorldBossParticipantSnapshot,
  getWorldBossTargetTtkSeconds,
  WORLD_BOSS_TTK_BALANCE_VERSION,
  WORLD_BOSS_TTK_PARTICIPANT_COUNTS,
} from '../src/modules/world-bosses/world-boss-ttk.util';

export type WorldBossTtkGearScenario = 'PREVIOUS' | 'CURRENT';

export type WorldBossTtkSimulationRow = {
  balanceVersion: number;
  tier: number;
  bossName: string;
  difficulty: string;
  bossLevel: number;
  className: string;
  gear: WorldBossTtkGearScenario;
  projectedEquipment: boolean;
  participantCount: number;
  targetTtkSeconds: number;
  expectedTtkSeconds: number;
  expectedTtkMinutes: number;
  readinessRatio: number;
  damagePerSecondPerPlayer: number;
  scalingDamagePerSecondPerPlayer: number;
  maxHp: number;
};

export type WorldBossTtkValidation = {
  key: string;
  passed: boolean;
  detail: string;
};

export type WorldBossRewardCalibrationRow = {
  tier: number;
  rarity: string;
  cocoonChancePercent: number;
  expectedWinsPerCocoon: number;
  averageFragmentsPerWin: number;
  fragmentCost: number;
  expectedCalendarHoursForCocoon: number;
  expectedCalendarHoursForFragments: number;
  expectedCalendarHoursForInputs: number;
  limitingInput: 'COCOON' | 'FRAGMENTS';
};

const SLOT_ORDER = [
  ItemSlot.MAIN_HAND,
  ItemSlot.OFF_HAND,
  ItemSlot.HEAD,
  ItemSlot.ARMOR,
  ItemSlot.PANTS,
  ItemSlot.BOOTS,
] as const;
const CLASS_NAMES = ['Lutador', 'Assassino', 'Atirador', 'Médico'] as const;

function normalize(value: string) {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getCanonicalLoadout(className: string, tier: number) {
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

function projectEquipmentItem(item: EquipmentSeedData, tier: number) {
  const multiplier = tier / Math.max(1, item.tier);
  const scale = (value?: number | null) =>
    Math.max(0, Math.round((value ?? 0) * multiplier));

  return {
    ...item,
    name: `${item.name} (projecao T${tier})`,
    tier,
    strengthBonus: scale(item.strengthBonus),
    vitalityBonus: scale(item.vitalityBonus),
    agilityBonus: scale(item.agilityBonus),
    precisionBonus: scale(item.precisionBonus),
    techniqueBonus: scale(item.techniqueBonus),
    willpowerBonus: scale(item.willpowerBonus),
  } satisfies EquipmentSeedData;
}

function getLoadout(className: string, tier: number) {
  if (tier <= 5) {
    return {
      items: getCanonicalLoadout(className, tier),
      projected: false,
    };
  }

  return {
    items: getCanonicalLoadout(className, 5).map((item) =>
      projectEquipmentItem(item, tier),
    ),
    projected: true,
  };
}

export function buildWorldBossTtkMatrix(): WorldBossTtkSimulationRow[] {
  return worldBossDefinitions.flatMap((boss) =>
    CLASS_NAMES.flatMap((className) => {
      const gameClass = classDefinitions.find(
        (candidate) => normalize(candidate.name) === normalize(className),
      );
      if (!gameClass) throw new Error(`Classe ${className} nao encontrada.`);

      return (['PREVIOUS', 'CURRENT'] as const).flatMap((gear) => {
        const loadout = getLoadout(
          className,
          gear === 'CURRENT' ? boss.tier : boss.tier - 1,
        );
        if (loadout.items.length !== SLOT_ORDER.length) {
          throw new Error(
            `Loadout ${gear} T${boss.tier} incompleto para ${className}.`,
          );
        }
        const stats = calculateFullStats(
          gameClass,
          loadout.items,
          boss.maxLevel,
        );
        const snapshot = createWorldBossParticipantSnapshot({
          bossTier: boss.tier,
          bossLevel: boss.maxLevel,
          characterLevel: boss.maxLevel,
          equipmentProgression: stats.equipmentProgression,
          equippedPieceCount: loadout.items.length,
          primaryStats: stats.totalPrimaryStats,
          derivedStats: stats.derivedCombatStats,
          boss,
        });

        return WORLD_BOSS_TTK_PARTICIPANT_COUNTS.map((participantCount) => {
          const targetTtkSeconds = getWorldBossTargetTtkSeconds(
            boss.difficulty,
            participantCount,
          );
          const maxHp = calculateWorldBossHpFromTtk({
            targetTtkSeconds,
            scalingDamagePerSecond: Array.from(
              { length: participantCount },
              () => snapshot.scalingDamagePerSecond,
            ),
          });
          const expectedTtkSeconds = calculateProjectedWorldBossTtkSeconds({
            hp: maxHp,
            damagePerSecond: Array.from(
              { length: participantCount },
              () => snapshot.damagePerSecond,
            ),
          });

          return {
            balanceVersion: WORLD_BOSS_TTK_BALANCE_VERSION,
            tier: boss.tier,
            bossName: boss.name,
            difficulty: boss.difficulty,
            bossLevel: boss.maxLevel,
            className,
            gear,
            projectedEquipment: loadout.projected,
            participantCount,
            targetTtkSeconds,
            expectedTtkSeconds: round(expectedTtkSeconds, 2),
            expectedTtkMinutes: round(expectedTtkSeconds / 60, 2),
            readinessRatio: round(snapshot.readinessRatio, 4),
            damagePerSecondPerPlayer: round(snapshot.damagePerSecond, 4),
            scalingDamagePerSecondPerPlayer: round(
              snapshot.scalingDamagePerSecond,
              4,
            ),
            maxHp,
          };
        });
      });
    }),
  );
}

export function validateWorldBossTtkMatrix(
  rows: WorldBossTtkSimulationRow[],
): WorldBossTtkValidation[] {
  const validations: WorldBossTtkValidation[] = [];
  const expectedRows =
    worldBossDefinitions.length *
    CLASS_NAMES.length *
    2 *
    WORLD_BOSS_TTK_PARTICIPANT_COUNTS.length;

  validations.push({
    key: 'MATRIX_COVERAGE',
    passed: rows.length === expectedRows,
    detail: `${rows.length}/${expectedRows} cenarios`,
  });
  validations.push({
    key: 'BOSS_COVERAGE',
    passed: new Set(rows.map((row) => row.bossName)).size === 20,
    detail: `${new Set(rows.map((row) => row.bossName)).size}/20 bosses`,
  });
  validations.push({
    key: 'TIER_COVERAGE',
    passed: new Set(rows.map((row) => row.tier)).size === 10,
    detail: `${new Set(rows.map((row) => row.tier)).size}/10 tiers`,
  });

  for (const current of rows.filter((row) => row.gear === 'CURRENT')) {
    validations.push({
      key: `CURRENT_TARGET:${current.bossName}:${current.className}:${current.participantCount}`,
      passed:
        Math.abs(current.expectedTtkSeconds - current.targetTtkSeconds) <= 1,
      detail: `${current.expectedTtkSeconds}s vs ${current.targetTtkSeconds}s`,
    });
    validations.push({
      key: `CURRENT_FINISHES:${current.bossName}:${current.className}:${current.participantCount}`,
      passed: current.expectedTtkSeconds < 3 * 60 * 60,
      detail: `${current.expectedTtkMinutes} min`,
    });

    const previous = rows.find(
      (row) =>
        row.bossName === current.bossName &&
        row.className === current.className &&
        row.participantCount === current.participantCount &&
        row.gear === 'PREVIOUS',
    );
    const slowdown = previous
      ? previous.expectedTtkSeconds / current.expectedTtkSeconds - 1
      : Number.NaN;
    validations.push({
      key: `PREVIOUS_SLOWDOWN:${current.bossName}:${current.className}:${current.participantCount}`,
      passed: slowdown >= 0.15 && slowdown <= 0.3,
      detail: `${round(slowdown * 100, 2)}%`,
    });
    validations.push({
      key: `PREVIOUS_FINISHES:${current.bossName}:${current.className}:${current.participantCount}`,
      passed: Boolean(previous && previous.expectedTtkSeconds < 3 * 60 * 60),
      detail: `${previous?.expectedTtkMinutes ?? 'N/D'} min`,
    });
  }

  return validations;
}

export function buildWorldBossRewardCalibration(
  rows: WorldBossTtkSimulationRow[],
): WorldBossRewardCalibrationRow[] {
  return ECONOMY_LAUNCH_TIERS.map((tier) => {
    const bosses = worldBossDefinitions.filter((boss) => boss.tier === tier);
    const chancePercent =
      ECONOMY_ACTIVITY_REWARDS.worldBossCocoonChancePercent[tier];
    const fragmentReward = ECONOMY_ACTIVITY_REWARDS.worldBossFragments[tier];
    const averageFragments = (fragmentReward.min + fragmentReward.max) / 2;
    const petDefinition = PET_DEFINITIONS.find(
      (definition) => definition.tier === tier,
    );
    if (!petDefinition) {
      throw new Error(`Configuracao de pet T${tier} nao encontrada.`);
    }

    const winsPerHour = bosses.reduce((total, boss) => {
      const currentSoloRows = rows.filter(
        (row) =>
          row.bossName === boss.name &&
          row.gear === 'CURRENT' &&
          row.participantCount === 1,
      );
      const averageTtkSeconds =
        currentSoloRows.reduce(
          (subtotal, row) => subtotal + row.expectedTtkSeconds,
          0,
        ) / Math.max(1, currentSoloRows.length);
      const slot = Number(boss.sortOrder) % 10 === 0 ? 0 : 1;
      const cycleHours =
        (WORLD_BOSS_SCHEDULE_CONFIG.entryWindowSeconds +
          averageTtkSeconds +
          getWorldBossRespawnSeconds(slot)) /
        3600;
      return total + 1 / cycleHours;
    }, 0);
    const cocoonRatePerHour = winsPerHour * (chancePercent / 100);
    const fragmentRatePerHour = winsPerHour * averageFragments;
    const expectedCalendarHoursForCocoon = 1 / cocoonRatePerHour;
    const expectedCalendarHoursForFragments =
      petDefinition.fragmentCost / fragmentRatePerHour;

    return {
      tier,
      rarity: getPetRarityByTier(tier),
      cocoonChancePercent: chancePercent,
      expectedWinsPerCocoon: round(100 / chancePercent),
      averageFragmentsPerWin: averageFragments,
      fragmentCost: petDefinition.fragmentCost,
      expectedCalendarHoursForCocoon: round(expectedCalendarHoursForCocoon),
      expectedCalendarHoursForFragments: round(
        expectedCalendarHoursForFragments,
      ),
      expectedCalendarHoursForInputs: round(
        Math.max(
          expectedCalendarHoursForCocoon,
          expectedCalendarHoursForFragments,
        ),
      ),
      limitingInput:
        expectedCalendarHoursForCocoon >= expectedCalendarHoursForFragments
          ? 'COCOON'
          : 'FRAGMENTS',
    };
  });
}

function toCsv<T extends object>(rows: T[]) {
  const headers = Object.keys(rows[0] ?? {});
  return [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = (row as Record<string, unknown>)[header];
          return typeof value === 'string'
            ? `"${value.replace(/"/g, '""')}"`
            : String(value);
        })
        .join(','),
    ),
  ].join('\n');
}

function buildSummary(rows: WorldBossTtkSimulationRow[]) {
  return worldBossDefinitions.map((boss) => {
    const bossRows = rows.filter((row) => row.bossName === boss.name);
    const currentSolo = bossRows.filter(
      (row) => row.gear === 'CURRENT' && row.participantCount === 1,
    );
    const previousSolo = bossRows.filter(
      (row) => row.gear === 'PREVIOUS' && row.participantCount === 1,
    );
    const average = (values: number[]) =>
      values.reduce((total, value) => total + value, 0) /
      Math.max(1, values.length);

    return {
      tier: boss.tier,
      boss: boss.name,
      difficulty: boss.difficulty,
      currentSoloMinutes: round(
        average(currentSolo.map((row) => row.expectedTtkMinutes)),
      ),
      previousSoloMinutes: round(
        average(previousSolo.map((row) => row.expectedTtkMinutes)),
      ),
      projectedEquipment: boss.tier > 5,
    };
  });
}

function main() {
  const rows = buildWorldBossTtkMatrix();
  const rewardCalibration = buildWorldBossRewardCalibration(rows);
  const validations = validateWorldBossTtkMatrix(rows);
  const failures = validations.filter((validation) => !validation.passed);
  const outputArg = process.argv.find((arg) => arg.startsWith('--output-dir='));
  const outputDir = outputArg?.slice('--output-dir='.length);

  console.log(
    `Matriz World Boss T1-T10 v${WORLD_BOSS_TTK_BALANCE_VERSION}: ${rows.length} cenarios.`,
  );
  console.table(buildSummary(rows));
  console.table(rewardCalibration);
  console.log(
    `Validacoes: ${validations.length - failures.length}/${validations.length} aprovadas.`,
  );
  if (failures.length > 0) console.table(failures.slice(0, 50));

  if (outputDir) {
    const absoluteOutputDir = resolve(outputDir);
    mkdirSync(absoluteOutputDir, { recursive: true });
    writeFileSync(
      resolve(absoluteOutputDir, 'world-boss-ttk-t1-t10.csv'),
      toCsv(rows),
      'utf8',
    );
    writeFileSync(
      resolve(absoluteOutputDir, 'world-boss-ttk-t1-t10.json'),
      JSON.stringify(
        {
          rows,
          validations,
          summary: buildSummary(rows),
          rewardCalibration,
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      resolve(absoluteOutputDir, 'world-boss-rewards-t1-t5.csv'),
      toCsv(rewardCalibration),
      'utf8',
    );
    console.log(`Relatorio exportado em ${absoluteOutputDir}.`);
  }

  if (process.argv.includes('--strict') && failures.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
