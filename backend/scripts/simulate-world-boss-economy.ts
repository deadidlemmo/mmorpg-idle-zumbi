import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorldBossEventStatus, WorldBossRewardType } from '@prisma/client';
import { worldBossDefinitions } from '../prisma/seed-data/world-bosses.seed-data';
import {
  ECONOMY_ACTIVITY_REWARDS,
  ECONOMY_LAUNCH_TIERS,
  PET_BOSS_AVAILABILITY_TARGET,
  PET_BOSS_DAILY_REWARD_POLICY,
  PET_DEFINITIONS,
  WORLD_BOSS_DAILY_XP_REWARD_POLICY,
} from '../src/common/config/economy.config';
import {
  getWorldBossCollectiveRewardMultiplier,
  getWorldBossRespawnSeconds,
  WORLD_BOSS_REWARD_CONFIG,
} from '../src/common/config/world-boss.config';
import {
  calculateWorldBossHpFromTtk,
  getWorldBossTargetTtkSeconds,
} from '../src/modules/world-bosses/world-boss-ttk.util';
import {
  applyWorldBossDailyPetRewardPolicy,
  getWorldBossDailyXpMultiplier,
  selectWorldBossRewards,
} from '../src/modules/world-bosses/world-boss-rewards';
import { buildActivityEconomyAudit } from './audit-activity-economy';
import {
  buildWorldBossTtkMatrix,
  type WorldBossTtkGearScenario,
  type WorldBossTtkSimulationRow,
} from './simulate-world-boss-ttk';

type LaunchTier = (typeof ECONOMY_LAUNCH_TIERS)[number];
type WorldBossDefinition = (typeof worldBossDefinitions)[number];
type WorldBossParticipantCount = 1 | 2 | 3 | 5 | 10;

export type WorldBossEconomyScenarioKey =
  | 'CURRENT_RELIABLE'
  | 'LOW_POPULATION'
  | 'MIXED_GROUP'
  | 'ABANDONMENT_STRESS';

type WeightedParticipantCount = {
  count: WorldBossParticipantCount;
  weight: number;
};

export type WorldBossEconomyScenario = {
  key: WorldBossEconomyScenarioKey;
  label: string;
  description: string;
  participantCounts: readonly WeightedParticipantCount[];
  currentGearChancePercent: number;
  plannedDropoutChancePercent: number;
};

export type WorldBossEconomyBossSummary = {
  scenario: WorldBossEconomyScenarioKey;
  tier: LaunchTier;
  bossName: string;
  difficulty: string;
  iterations: number;
  averageInitialParticipants: number;
  victoryChancePercent: number;
  actualAbandonmentPercent: number;
  rewardCoveragePercent: number;
  eligibleVictoryCoveragePercent: number;
  averageDurationMinutes: number;
  p50DurationMinutes: number;
  p90DurationMinutes: number;
  averageProgressPercent: number;
  goldPerRegistration: number;
  xpPerRegistration: number;
  eligibleVictoryXpPerRegistration: number;
  otherXpPerRegistration: number;
  fragmentsPerRegistration: number;
  cocoonChancePerRegistrationPercent: number;
  totalGoldInjectedPerEvent: number;
  activeHoursPerRegistration: number;
  directGoldPerParticipantHour: number;
  autoCombatNetGoldPerHour: number;
  autoCombatXpPerHour: number;
  directGoldRateVsAutoCombatPercent: number;
  eventsPerCalendarDay: number;
  classRegistrations: Record<string, number>;
  gearRegistrations: Record<WorldBossTtkGearScenario, number>;
};

export type WorldBossEconomyTierSummary = {
  scenario: WorldBossEconomyScenarioKey;
  tier: LaunchTier;
  iterations: number;
  victoryChancePercent: number;
  actualAbandonmentPercent: number;
  rewardCoveragePercent: number;
  averageDurationMinutes: number;
  goldPerRegistration: number;
  xpPerRegistration: number;
  fragmentsPerRegistration: number;
  cocoonChancePerRegistrationPercent: number;
  directGoldPerParticipantHour: number;
  autoCombatNetGoldPerHour: number;
  maxBossGoldPerPlayerCalendarDay: number;
  maxBossGoldVsEightHourAutoCombatPercent: number;
  maxBossActiveHoursPerPlayerCalendarDay: number;
  maxBossOpportunityCostGoldPerCalendarDay: number;
  maxNetGoldDeltaVsEightHourAutoCombatPercent: number;
  maxBossXpPerPlayerCalendarDay: number;
  rawMaxBossXpPerPlayerCalendarDay: number;
  maxBossOpportunityCostXpPerCalendarDay: number;
  maxNetXpDeltaVsEightHourAutoCombatPercent: number;
  maxBossFragmentsPerPlayerCalendarDay: number;
  totalBossWindowsPerCalendarDay: number;
  maxEligiblePetRewardVictoriesPerCalendarDay: number;
  fullPetRewardVictoriesPerCalendarDay: number;
  activeDailyCocoonChancePercent: number;
  medianCocoonAttempts: number | null;
  p90CocoonAttempts: number | null;
  medianCocoonCalendarDaysAllWindows: number | null;
  p90CocoonCalendarDaysAllWindows: number | null;
  expectedFragmentAttempts: number | null;
  expectedFragmentDaysAllWindows: number | null;
  expectedPetInputDaysAtOneAttemptPerDay: number | null;
  expectedPetInputDaysAllWindows: number | null;
};

export type WorldBossEconomyFinding = {
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  code: string;
  scenario: WorldBossEconomyScenarioKey;
  tier: LaunchTier;
  message: string;
};

export type WorldBossEconomySimulationReport = {
  generatedAt: string;
  seed: number;
  iterationsPerBoss: number;
  simulatedMatches: number;
  source: 'CANONICAL_RULES_MONTE_CARLO';
  assumptions: {
    databaseWrites: false;
    classSelection: string;
    hpScaling: string;
    dropout: string;
    rewards: string;
    calendar: string;
  };
  scenarios: readonly WorldBossEconomyScenario[];
  bosses: WorldBossEconomyBossSummary[];
  tiers: WorldBossEconomyTierSummary[];
  findings: WorldBossEconomyFinding[];
  assessment: 'HEALTHY_WITH_ASSUMPTIONS' | 'ATTENTION';
};

const CLASS_NAMES = ['Lutador', 'Assassino', 'Atirador', 'Médico'] as const;
const DEFAULT_ITERATIONS_PER_BOSS = 10_000;
const DEFAULT_SEED = 0xdead1d1e;
const EIGHT_HOUR_PROFILE = 8;
const NET_GOLD_DAILY_INCREMENT_LIMIT_PERCENT = 20;
const NET_XP_DAILY_INCREMENT_LIMIT_PERCENT = 40;
const SIMULATION_EPSILON_SECONDS = 0.000_001;

export const WORLD_BOSS_ECONOMY_SCENARIOS = Object.freeze([
  {
    key: 'CURRENT_RELIABLE',
    label: 'Set atual, grupo confiável',
    description:
      'Set completo do tier, sem abandono e grupos de 1, 2, 3, 5 ou 10 participantes.',
    participantCounts: [
      { count: 1, weight: 25 },
      { count: 2, weight: 25 },
      { count: 3, weight: 20 },
      { count: 5, weight: 20 },
      { count: 10, weight: 10 },
    ],
    currentGearChancePercent: 100,
    plannedDropoutChancePercent: 0,
  },
  {
    key: 'LOW_POPULATION',
    label: 'Servidor inicial',
    description:
      'Um a três participantes, 90% com set anterior e 10% de chance individual de planejar abandono.',
    participantCounts: [
      { count: 1, weight: 45 },
      { count: 2, weight: 40 },
      { count: 3, weight: 15 },
    ],
    currentGearChancePercent: 10,
    plannedDropoutChancePercent: 10,
  },
  {
    key: 'MIXED_GROUP',
    label: 'Grupo misto',
    description:
      'Dois a dez participantes, 60% com set atual e 8% de chance individual de planejar abandono.',
    participantCounts: [
      { count: 2, weight: 20 },
      { count: 3, weight: 35 },
      { count: 5, weight: 35 },
      { count: 10, weight: 10 },
    ],
    currentGearChancePercent: 60,
    plannedDropoutChancePercent: 8,
  },
  {
    key: 'ABANDONMENT_STRESS',
    label: 'Estresse de abandono',
    description:
      'Um a três participantes, 90% com set anterior e 30% de chance individual de planejar abandono.',
    participantCounts: [
      { count: 1, weight: 35 },
      { count: 2, weight: 40 },
      { count: 3, weight: 25 },
    ],
    currentGearChancePercent: 10,
    plannedDropoutChancePercent: 30,
  },
] satisfies readonly WorldBossEconomyScenario[]);

type RandomSource = () => number;

type SimulatedParticipant = {
  id: string;
  className: string;
  gear: WorldBossTtkGearScenario;
  damagePerSecond: number;
  scalingDamagePerSecond: number;
  plannedLeaveAtSeconds: number;
  damageDealt: number;
};

type SimulatedMatch = {
  defeated: boolean;
  durationSeconds: number;
  progressRatio: number;
  initialParticipants: number;
  abandonedParticipants: number;
  rewardedParticipants: number;
  eligibleVictoryParticipants: number;
  participantActiveSeconds: number;
  gold: number;
  xp: number;
  eligibleVictoryXp: number;
  otherXp: number;
  fragments: number;
  cocoons: number;
  classRegistrations: Record<string, number>;
  gearRegistrations: Record<WorldBossTtkGearScenario, number>;
};

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomInt(random: RandomSource, min: number, max: number) {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  return safeMin + Math.floor(random() * (safeMax - safeMin + 1));
}

function weightedParticipantCount(
  random: RandomSource,
  rows: readonly WeightedParticipantCount[],
) {
  const totalWeight = rows.reduce((total, row) => total + row.weight, 0);
  let roll = random() * totalWeight;
  for (const row of rows) {
    roll -= row.weight;
    if (roll < 0) return row.count;
  }
  return rows.at(-1)?.count ?? 1;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * clamp(ratio, 0, 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return (
    ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
  );
}

function attemptsForProbability(
  chancePerAttempt: number,
  targetProbability: number,
) {
  const chance = clamp(chancePerAttempt, 0, 1);
  if (chance <= 0) return null;
  if (chance >= 1) return 1;
  return Math.ceil(
    Math.log(1 - clamp(targetProbability, 0, 0.999999)) / Math.log(1 - chance),
  );
}

function profileKey(
  bossName: string,
  className: string,
  gear: WorldBossTtkGearScenario,
) {
  return `${bossName}:${className}:${gear}`;
}

function buildProfileLookup(rows: WorldBossTtkSimulationRow[]) {
  return new Map(
    rows
      .filter((row) => row.participantCount === 1 && row.tier <= 5)
      .map((row) => [profileKey(row.bossName, row.className, row.gear), row]),
  );
}

let cachedProfileLookup: Map<string, WorldBossTtkSimulationRow> | null = null;
let cachedAutoCombatByTier: Map<
  number,
  { netGoldPerHour: number; xpPerHour: number }
> | null = null;

function getProfileLookup() {
  if (!cachedProfileLookup) {
    cachedProfileLookup = buildProfileLookup(buildWorldBossTtkMatrix());
  }
  return cachedProfileLookup;
}

function getAutoCombatByTier() {
  if (!cachedAutoCombatByTier) {
    const canonicalEconomy = buildActivityEconomyAudit();
    cachedAutoCombatByTier = new Map(
      canonicalEconomy.tiers.map((tier) => [
        tier.tier,
        {
          netGoldPerHour: tier.autoCombat.netGoldEquivalentPerHour,
          xpPerHour: tier.autoCombat.characterXpPerHour,
        },
      ]),
    );
  }
  return cachedAutoCombatByTier;
}

function createParticipant(params: {
  index: number;
  boss: WorldBossDefinition;
  scenario: WorldBossEconomyScenario;
  targetTtkSeconds: number;
  profileLookup: Map<string, WorldBossTtkSimulationRow>;
  random: RandomSource;
}): SimulatedParticipant {
  const className =
    CLASS_NAMES[randomInt(params.random, 0, CLASS_NAMES.length - 1)];
  const gear: WorldBossTtkGearScenario =
    params.random() * 100 < params.scenario.currentGearChancePercent
      ? 'CURRENT'
      : 'PREVIOUS';
  const profile = params.profileLookup.get(
    profileKey(params.boss.name, className, gear),
  );
  if (!profile) {
    throw new Error(
      `Perfil ausente para ${params.boss.name}, ${className}, ${gear}.`,
    );
  }

  const plansDropout =
    params.random() * 100 < params.scenario.plannedDropoutChancePercent;
  const minParticipationSeconds = params.boss.minParticipationSeconds ?? 300;
  const minimumLeaveAt = Math.min(
    params.boss.durationSeconds - 1,
    Math.max(minParticipationSeconds, params.targetTtkSeconds * 0.25),
  );
  const maximumLeaveAt = Math.max(
    minimumLeaveAt + 1,
    Math.min(params.boss.durationSeconds - 1, params.targetTtkSeconds * 1.25),
  );

  return {
    id: `participant-${params.index}`,
    className,
    gear,
    damagePerSecond: profile.damagePerSecondPerPlayer,
    scalingDamagePerSecond: profile.scalingDamagePerSecondPerPlayer,
    plannedLeaveAtSeconds: plansDropout
      ? minimumLeaveAt + params.random() * (maximumLeaveAt - minimumLeaveAt)
      : params.boss.durationSeconds,
    damageDealt: 0,
  };
}

function applyDamageSegment(
  participants: SimulatedParticipant[],
  fromSeconds: number,
  durationSeconds: number,
) {
  if (durationSeconds <= 0) return 0;
  let damage = 0;
  for (const participant of participants) {
    if (participant.plannedLeaveAtSeconds <= fromSeconds) continue;
    const activeDuration = Math.min(
      durationSeconds,
      participant.plannedLeaveAtSeconds - fromSeconds,
    );
    if (activeDuration <= 0) continue;
    const dealt = participant.damagePerSecond * activeDuration;
    participant.damageDealt += dealt;
    damage += dealt;
  }
  return damage;
}

function normalizeRewards(boss: WorldBossDefinition) {
  return boss.lootTable.map((reward) => ({
    rewardType: reward.rewardType,
    itemId: null,
    itemName: reward.itemName ?? null,
    currency: reward.currency ?? null,
    minQuantity: reward.minQuantity,
    maxQuantity: reward.maxQuantity,
    chance: reward.chance,
    guaranteed: reward.guaranteed ?? false,
    onlyIfDefeated: reward.onlyIfDefeated ?? false,
    requiresMinParticipation: reward.requiresMinParticipation ?? true,
    randomPetCocoon: reward.randomPetCocoon ?? false,
    minContributionPercent: reward.minContributionPercent ?? 0,
    rarity: reward.rarity ?? null,
  }));
}

export function simulateWorldBossEconomyMatch(params: {
  boss: WorldBossDefinition;
  scenario: WorldBossEconomyScenario;
  profileLookup: Map<string, WorldBossTtkSimulationRow>;
  random: RandomSource;
}): SimulatedMatch {
  const participantCount = weightedParticipantCount(
    params.random,
    params.scenario.participantCounts,
  );
  const targetTtkSeconds = getWorldBossTargetTtkSeconds(
    params.boss.difficulty,
    participantCount,
  );
  const participants = Array.from({ length: participantCount }, (_, index) =>
    createParticipant({
      index,
      boss: params.boss,
      scenario: params.scenario,
      targetTtkSeconds,
      profileLookup: params.profileLookup,
      random: params.random,
    }),
  );
  const maxHp = calculateWorldBossHpFromTtk({
    targetTtkSeconds,
    scalingDamagePerSecond: participants.map(
      (participant) => participant.scalingDamagePerSecond,
    ),
  });

  let elapsedSeconds = 0;
  let remainingHp = maxHp;
  while (elapsedSeconds < params.boss.durationSeconds && remainingHp > 0) {
    const activeParticipants = participants.filter(
      (participant) =>
        participant.plannedLeaveAtSeconds >
        elapsedSeconds + SIMULATION_EPSILON_SECONDS,
    );
    if (activeParticipants.length === 0) {
      elapsedSeconds = params.boss.durationSeconds;
      break;
    }
    const aggregateDamagePerSecond = activeParticipants.reduce(
      (total, participant) => total + participant.damagePerSecond,
      0,
    );
    if (aggregateDamagePerSecond <= 0) {
      elapsedSeconds = params.boss.durationSeconds;
      break;
    }
    const nextLeaveAt = Math.min(
      params.boss.durationSeconds,
      ...activeParticipants.map(
        (participant) => participant.plannedLeaveAtSeconds,
      ),
    );
    const secondsToDefeat = remainingHp / aggregateDamagePerSecond;
    const availableSegment = Math.min(
      nextLeaveAt - elapsedSeconds,
      params.boss.durationSeconds - elapsedSeconds,
    );
    if (secondsToDefeat <= availableSegment + SIMULATION_EPSILON_SECONDS) {
      applyDamageSegment(activeParticipants, elapsedSeconds, secondsToDefeat);
      elapsedSeconds += secondsToDefeat;
      remainingHp = 0;
      break;
    }
    if (availableSegment <= SIMULATION_EPSILON_SECONDS) {
      elapsedSeconds = Math.min(
        params.boss.durationSeconds,
        Math.max(nextLeaveAt, elapsedSeconds + SIMULATION_EPSILON_SECONDS),
      );
      continue;
    }
    const segmentDuration = availableSegment;
    const damage = applyDamageSegment(
      activeParticipants,
      elapsedSeconds,
      segmentDuration,
    );
    remainingHp = Math.max(0, remainingHp - damage);
    elapsedSeconds += segmentDuration;
  }

  const defeated = remainingHp <= 0;
  const terminalSeconds = defeated
    ? elapsedSeconds
    : params.boss.durationSeconds;
  const totalDamage = maxHp - remainingHp;
  const progressRatio = maxHp > 0 ? totalDamage / maxHp : 0;
  const collectiveMultiplier = getWorldBossCollectiveRewardMultiplier({
    defeated,
    progressRatio,
  });
  const rewards = normalizeRewards(params.boss);
  const classRegistrations: Record<string, number> = {};
  const gearRegistrations: Record<WorldBossTtkGearScenario, number> = {
    PREVIOUS: 0,
    CURRENT: 0,
  };
  let abandonedParticipants = 0;
  let rewardedParticipants = 0;
  let eligibleVictoryParticipants = 0;
  let participantActiveSeconds = 0;
  let gold = 0;
  let xp = 0;
  let eligibleVictoryXp = 0;
  let otherXp = 0;
  let fragments = 0;
  let cocoons = 0;

  for (const participant of participants) {
    classRegistrations[participant.className] =
      (classRegistrations[participant.className] ?? 0) + 1;
    gearRegistrations[participant.gear] += 1;
    const activeSeconds = Math.min(
      participant.plannedLeaveAtSeconds,
      terminalSeconds,
    );
    participantActiveSeconds += activeSeconds;
    const leftBeforeTerminal =
      participant.plannedLeaveAtSeconds < terminalSeconds;
    if (leftBeforeTerminal) {
      abandonedParticipants += 1;
      continue;
    }

    const contributionPercent =
      totalDamage > 0 ? (participant.damageDealt / totalDamage) * 100 : 0;
    const eligibleForReward =
      activeSeconds >= (params.boss.minParticipationSeconds ?? 300) ||
      participant.damageDealt >= (params.boss.minParticipationDamage ?? 1);
    const eligibleVictory = defeated && eligibleForReward;
    if (eligibleVictory) eligibleVictoryParticipants += 1;
    const rewardCandidates = applyWorldBossDailyPetRewardPolicy(
      rewards,
      {
        eligibleVictory,
        previousEligibleVictories: 0,
        cocoonsGranted: 0,
      },
      PET_BOSS_DAILY_REWARD_POLICY,
    );
    const selectedRewards = selectWorldBossRewards({
      event: {
        status: defeated
          ? WorldBossEventStatus.DEFEATED
          : WorldBossEventStatus.EXPIRED,
        currentHp: remainingHp,
        defeatedAt: defeated ? new Date(0) : null,
      },
      participant: { eligibleForReward, contributionPercent },
      rewards: rewardCandidates,
      collectiveMultiplier,
      nonDefeatedChanceMultiplier:
        WORLD_BOSS_REWARD_CONFIG.nonDefeatedChanceMultiplier,
      randomPercent: params.random,
      randomInt: (min, max) => randomInt(params.random, min, max),
    });
    if (selectedRewards.length > 0) rewardedParticipants += 1;

    for (const reward of selectedRewards) {
      if (reward.rewardType === WorldBossRewardType.GOLD) {
        gold += reward.quantity;
      } else if (reward.rewardType === WorldBossRewardType.XP) {
        xp += reward.quantity;
        if (eligibleVictory) eligibleVictoryXp += reward.quantity;
        else otherXp += reward.quantity;
      } else if (reward.isWorldBossFragment) {
        fragments += reward.quantity;
      } else if (reward.rewardType === WorldBossRewardType.PET_EGG) {
        cocoons += reward.quantity;
      }
    }
  }

  return {
    defeated,
    durationSeconds: terminalSeconds,
    progressRatio,
    initialParticipants: participants.length,
    abandonedParticipants,
    rewardedParticipants,
    eligibleVictoryParticipants,
    participantActiveSeconds,
    gold,
    xp,
    eligibleVictoryXp,
    otherXp,
    fragments,
    cocoons,
    classRegistrations,
    gearRegistrations,
  };
}

function summarizeBoss(params: {
  boss: WorldBossDefinition;
  scenario: WorldBossEconomyScenario;
  iterations: number;
  profileLookup: Map<string, WorldBossTtkSimulationRow>;
  random: RandomSource;
  autoCombatNetGoldPerHour: number;
  autoCombatXpPerHour: number;
}): WorldBossEconomyBossSummary {
  const matches = Array.from({ length: params.iterations }, () =>
    simulateWorldBossEconomyMatch({
      boss: params.boss,
      scenario: params.scenario,
      profileLookup: params.profileLookup,
      random: params.random,
    }),
  );
  const registrations = matches.reduce(
    (total, match) => total + match.initialParticipants,
    0,
  );
  const activeSeconds = matches.reduce(
    (total, match) => total + match.participantActiveSeconds,
    0,
  );
  const totalGold = matches.reduce((total, match) => total + match.gold, 0);
  const totalXp = matches.reduce((total, match) => total + match.xp, 0);
  const totalEligibleVictoryXp = matches.reduce(
    (total, match) => total + match.eligibleVictoryXp,
    0,
  );
  const totalOtherXp = matches.reduce(
    (total, match) => total + match.otherXp,
    0,
  );
  const totalFragments = matches.reduce(
    (total, match) => total + match.fragments,
    0,
  );
  const totalCocoons = matches.reduce(
    (total, match) => total + match.cocoons,
    0,
  );
  const classRegistrations: Record<string, number> = {};
  const gearRegistrations: Record<WorldBossTtkGearScenario, number> = {
    PREVIOUS: 0,
    CURRENT: 0,
  };
  for (const match of matches) {
    for (const [className, count] of Object.entries(match.classRegistrations)) {
      classRegistrations[className] =
        (classRegistrations[className] ?? 0) + count;
    }
    gearRegistrations.PREVIOUS += match.gearRegistrations.PREVIOUS;
    gearRegistrations.CURRENT += match.gearRegistrations.CURRENT;
  }
  const averageDurationSeconds =
    matches.reduce((total, match) => total + match.durationSeconds, 0) /
    params.iterations;
  const directGoldPerParticipantHour =
    totalGold / Math.max(1, activeSeconds / 3_600);
  const slotIndex = Number(params.boss.sortOrder ?? 0) % 10;
  const eventsPerCalendarDay =
    86_400 / (getWorldBossRespawnSeconds(slotIndex) + averageDurationSeconds);

  return {
    scenario: params.scenario.key,
    tier: params.boss.tier as LaunchTier,
    bossName: params.boss.name,
    difficulty: params.boss.difficulty,
    iterations: params.iterations,
    averageInitialParticipants: round(registrations / params.iterations),
    victoryChancePercent: round(
      (matches.filter((match) => match.defeated).length / params.iterations) *
        100,
    ),
    actualAbandonmentPercent: round(
      (matches.reduce(
        (total, match) => total + match.abandonedParticipants,
        0,
      ) /
        Math.max(1, registrations)) *
        100,
    ),
    rewardCoveragePercent: round(
      (matches.reduce((total, match) => total + match.rewardedParticipants, 0) /
        Math.max(1, registrations)) *
        100,
    ),
    eligibleVictoryCoveragePercent: round(
      (matches.reduce(
        (total, match) => total + match.eligibleVictoryParticipants,
        0,
      ) /
        Math.max(1, registrations)) *
        100,
    ),
    averageDurationMinutes: round(averageDurationSeconds / 60),
    p50DurationMinutes: round(
      percentile(
        matches.map((match) => match.durationSeconds / 60),
        0.5,
      ),
    ),
    p90DurationMinutes: round(
      percentile(
        matches.map((match) => match.durationSeconds / 60),
        0.9,
      ),
    ),
    averageProgressPercent: round(
      (matches.reduce((total, match) => total + match.progressRatio, 0) /
        params.iterations) *
        100,
    ),
    goldPerRegistration: round(totalGold / Math.max(1, registrations)),
    xpPerRegistration: round(totalXp / Math.max(1, registrations)),
    eligibleVictoryXpPerRegistration: round(
      totalEligibleVictoryXp / Math.max(1, registrations),
    ),
    otherXpPerRegistration: round(totalOtherXp / Math.max(1, registrations)),
    fragmentsPerRegistration: round(
      totalFragments / Math.max(1, registrations),
      4,
    ),
    cocoonChancePerRegistrationPercent: round(
      (totalCocoons / Math.max(1, registrations)) * 100,
      4,
    ),
    totalGoldInjectedPerEvent: round(totalGold / params.iterations),
    activeHoursPerRegistration: round(
      activeSeconds / Math.max(1, registrations) / 3_600,
      4,
    ),
    directGoldPerParticipantHour: round(directGoldPerParticipantHour),
    autoCombatNetGoldPerHour: round(params.autoCombatNetGoldPerHour),
    autoCombatXpPerHour: round(params.autoCombatXpPerHour),
    directGoldRateVsAutoCombatPercent: round(
      (directGoldPerParticipantHour /
        Math.max(1, params.autoCombatNetGoldPerHour)) *
        100,
    ),
    eventsPerCalendarDay: round(eventsPerCalendarDay, 4),
    classRegistrations,
    gearRegistrations,
  };
}

function getExpectedDailyXpMultiplier(
  tier: LaunchTier,
  expectedEligibleVictories: number,
) {
  if (expectedEligibleVictories <= 0) return 1;

  let remainingVictories = expectedEligibleVictories;
  let previousEligibleVictories = 0;
  let weightedMultiplier = 0;
  while (remainingVictories > 0) {
    const victoryWeight = Math.min(1, remainingVictories);
    weightedMultiplier +=
      victoryWeight *
      getWorldBossDailyXpMultiplier(
        tier,
        previousEligibleVictories,
        WORLD_BOSS_DAILY_XP_REWARD_POLICY,
      );
    remainingVictories -= victoryWeight;
    previousEligibleVictories += 1;
  }

  return weightedMultiplier / expectedEligibleVictories;
}

function summarizeTier(params: {
  tier: LaunchTier;
  scenario: WorldBossEconomyScenario;
  bosses: WorldBossEconomyBossSummary[];
  autoCombatNetGoldPerHour: number;
  autoCombatXpPerHour: number;
}): WorldBossEconomyTierSummary {
  const rows = params.bosses.filter(
    (row) => row.tier === params.tier && row.scenario === params.scenario.key,
  );
  const average = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) /
    Math.max(1, values.length);
  const totalBossWindowsPerCalendarDay = rows.reduce(
    (total, row) => total + row.eventsPerCalendarDay,
    0,
  );
  const maxBossGoldPerPlayerCalendarDay = rows.reduce(
    (total, row) => total + row.goldPerRegistration * row.eventsPerCalendarDay,
    0,
  );
  const maxBossActiveHoursPerPlayerCalendarDay = rows.reduce(
    (total, row) =>
      total + row.activeHoursPerRegistration * row.eventsPerCalendarDay,
    0,
  );
  const maxBossOpportunityCostGoldPerCalendarDay =
    maxBossActiveHoursPerPlayerCalendarDay * params.autoCombatNetGoldPerHour;
  const maxNetGoldDeltaVsEightHourAutoCombatPercent =
    ((maxBossGoldPerPlayerCalendarDay -
      maxBossOpportunityCostGoldPerCalendarDay) /
      Math.max(1, params.autoCombatNetGoldPerHour * EIGHT_HOUR_PROFILE)) *
    100;
  const rawEligibleVictoryXpPerPlayerCalendarDay = rows.reduce(
    (total, row) =>
      total + row.eligibleVictoryXpPerRegistration * row.eventsPerCalendarDay,
    0,
  );
  const otherXpPerPlayerCalendarDay = rows.reduce(
    (total, row) =>
      total + row.otherXpPerRegistration * row.eventsPerCalendarDay,
    0,
  );
  const maxEligiblePetRewardVictoriesPerCalendarDay = rows.reduce(
    (total, row) =>
      total +
      row.eventsPerCalendarDay * (row.eligibleVictoryCoveragePercent / 100),
    0,
  );
  const dailyXpMultiplier = getExpectedDailyXpMultiplier(
    params.tier,
    maxEligiblePetRewardVictoriesPerCalendarDay,
  );
  const rawMaxBossXpPerPlayerCalendarDay =
    rawEligibleVictoryXpPerPlayerCalendarDay + otherXpPerPlayerCalendarDay;
  const maxBossXpPerPlayerCalendarDay =
    rawEligibleVictoryXpPerPlayerCalendarDay * dailyXpMultiplier +
    otherXpPerPlayerCalendarDay;
  const maxBossOpportunityCostXpPerCalendarDay =
    maxBossActiveHoursPerPlayerCalendarDay * params.autoCombatXpPerHour;
  const maxNetXpDeltaVsEightHourAutoCombatPercent =
    ((maxBossXpPerPlayerCalendarDay - maxBossOpportunityCostXpPerCalendarDay) /
      Math.max(1, params.autoCombatXpPerHour * EIGHT_HOUR_PROFILE)) *
    100;
  const noEligibleVictoryProbability = rows.reduce(
    (probability, row) =>
      probability *
      (1 - clamp(row.eligibleVictoryCoveragePercent / 100, 0, 1)) **
        row.eventsPerCalendarDay,
    1,
  );
  const fullPetRewardVictoriesPerCalendarDay = 1 - noEligibleVictoryProbability;
  const uncappedFragmentsPerCalendarDay = rows.reduce(
    (total, row) =>
      total + row.fragmentsPerRegistration * row.eventsPerCalendarDay,
    0,
  );
  const fragmentsPerEligibleVictory =
    maxEligiblePetRewardVictoriesPerCalendarDay > 0
      ? uncappedFragmentsPerCalendarDay /
        maxEligiblePetRewardVictoriesPerCalendarDay
      : 0;
  const maxBossFragmentsPerPlayerCalendarDay =
    fragmentsPerEligibleVictory * fullPetRewardVictoriesPerCalendarDay +
    Math.max(
      0,
      maxEligiblePetRewardVictoriesPerCalendarDay -
        fullPetRewardVictoriesPerCalendarDay,
    ) *
      PET_BOSS_DAILY_REWARD_POLICY.subsequentFragmentQuantity;
  const averageCocoonChance =
    average(rows.map((row) => row.cocoonChancePerRegistrationPercent)) / 100;
  const medianCocoonAttempts = attemptsForProbability(averageCocoonChance, 0.5);
  const p90CocoonAttempts = attemptsForProbability(averageCocoonChance, 0.9);
  const baseCocoonChance =
    ECONOMY_ACTIVITY_REWARDS.worldBossCocoonChancePercent[params.tier] / 100;
  const eligibleVictoriesWhenActive =
    fullPetRewardVictoriesPerCalendarDay > 0
      ? maxEligiblePetRewardVictoriesPerCalendarDay /
        fullPetRewardVictoriesPerCalendarDay
      : 0;
  const subsequentCocoonChance =
    baseCocoonChance *
    PET_BOSS_DAILY_REWARD_POLICY.subsequentCocoonChanceMultiplier;
  const activeDailyCocoonChance =
    fullPetRewardVictoriesPerCalendarDay *
    (1 -
      (1 - baseCocoonChance) *
        (1 - subsequentCocoonChance) **
          Math.max(0, eligibleVictoriesWhenActive - 1));
  const medianCocoonCalendarDaysAllWindows = attemptsForProbability(
    activeDailyCocoonChance,
    0.5,
  );
  const p90CocoonCalendarDaysAllWindows = attemptsForProbability(
    activeDailyCocoonChance,
    0.9,
  );
  const pet = PET_DEFINITIONS.find(
    (definition) => definition.tier === params.tier,
  );
  const averageFragmentsPerRegistration = average(
    rows.map((row) => row.fragmentsPerRegistration),
  );
  const expectedFragmentAttempts =
    pet && averageFragmentsPerRegistration > 0
      ? pet.fragmentCost / averageFragmentsPerRegistration
      : null;
  const expectedFragmentDaysAllWindows =
    pet && maxBossFragmentsPerPlayerCalendarDay > 0
      ? pet.fragmentCost / maxBossFragmentsPerPlayerCalendarDay
      : null;
  const expectedPetInputAttempts = Math.max(
    medianCocoonAttempts ?? Number.POSITIVE_INFINITY,
    expectedFragmentAttempts ?? Number.POSITIVE_INFINITY,
  );
  const expectedPetInputDaysAllWindows = Math.max(
    medianCocoonCalendarDaysAllWindows ?? Number.POSITIVE_INFINITY,
    expectedFragmentDaysAllWindows ?? Number.POSITIVE_INFINITY,
  );

  return {
    scenario: params.scenario.key,
    tier: params.tier,
    iterations: rows.reduce((total, row) => total + row.iterations, 0),
    victoryChancePercent: round(
      average(rows.map((row) => row.victoryChancePercent)),
    ),
    actualAbandonmentPercent: round(
      average(rows.map((row) => row.actualAbandonmentPercent)),
    ),
    rewardCoveragePercent: round(
      average(rows.map((row) => row.rewardCoveragePercent)),
    ),
    averageDurationMinutes: round(
      average(rows.map((row) => row.averageDurationMinutes)),
    ),
    goldPerRegistration: round(
      average(rows.map((row) => row.goldPerRegistration)),
    ),
    xpPerRegistration: round(average(rows.map((row) => row.xpPerRegistration))),
    fragmentsPerRegistration: round(averageFragmentsPerRegistration, 4),
    cocoonChancePerRegistrationPercent: round(averageCocoonChance * 100, 4),
    directGoldPerParticipantHour: round(
      average(rows.map((row) => row.directGoldPerParticipantHour)),
    ),
    autoCombatNetGoldPerHour: round(params.autoCombatNetGoldPerHour),
    autoCombatXpPerHour: round(params.autoCombatXpPerHour),
    maxBossGoldPerPlayerCalendarDay: round(maxBossGoldPerPlayerCalendarDay),
    maxBossGoldVsEightHourAutoCombatPercent: round(
      (maxBossGoldPerPlayerCalendarDay /
        Math.max(1, params.autoCombatNetGoldPerHour * EIGHT_HOUR_PROFILE)) *
        100,
    ),
    maxBossActiveHoursPerPlayerCalendarDay: round(
      maxBossActiveHoursPerPlayerCalendarDay,
      4,
    ),
    maxBossOpportunityCostGoldPerCalendarDay: round(
      maxBossOpportunityCostGoldPerCalendarDay,
    ),
    maxNetGoldDeltaVsEightHourAutoCombatPercent: round(
      maxNetGoldDeltaVsEightHourAutoCombatPercent,
    ),
    maxBossXpPerPlayerCalendarDay: round(maxBossXpPerPlayerCalendarDay),
    rawMaxBossXpPerPlayerCalendarDay: round(rawMaxBossXpPerPlayerCalendarDay),
    maxBossOpportunityCostXpPerCalendarDay: round(
      maxBossOpportunityCostXpPerCalendarDay,
    ),
    maxNetXpDeltaVsEightHourAutoCombatPercent: round(
      maxNetXpDeltaVsEightHourAutoCombatPercent,
    ),
    maxBossFragmentsPerPlayerCalendarDay: round(
      maxBossFragmentsPerPlayerCalendarDay,
      4,
    ),
    totalBossWindowsPerCalendarDay: round(totalBossWindowsPerCalendarDay, 4),
    maxEligiblePetRewardVictoriesPerCalendarDay: round(
      maxEligiblePetRewardVictoriesPerCalendarDay,
      4,
    ),
    fullPetRewardVictoriesPerCalendarDay: round(
      fullPetRewardVictoriesPerCalendarDay,
      4,
    ),
    activeDailyCocoonChancePercent: round(activeDailyCocoonChance * 100, 4),
    medianCocoonAttempts,
    p90CocoonAttempts,
    medianCocoonCalendarDaysAllWindows,
    p90CocoonCalendarDaysAllWindows,
    expectedFragmentAttempts:
      expectedFragmentAttempts === null
        ? null
        : round(expectedFragmentAttempts, 2),
    expectedFragmentDaysAllWindows:
      expectedFragmentDaysAllWindows === null
        ? null
        : round(expectedFragmentDaysAllWindows, 2),
    expectedPetInputDaysAtOneAttemptPerDay: Number.isFinite(
      expectedPetInputAttempts,
    )
      ? round(expectedPetInputAttempts, 2)
      : null,
    expectedPetInputDaysAllWindows: Number.isFinite(
      expectedPetInputDaysAllWindows,
    )
      ? round(expectedPetInputDaysAllWindows, 2)
      : null,
  };
}

function buildFindings(tiers: WorldBossEconomyTierSummary[]) {
  const findings: WorldBossEconomyFinding[] = [];
  for (const row of tiers) {
    if (
      row.scenario === 'CURRENT_RELIABLE' &&
      row.maxNetGoldDeltaVsEightHourAutoCombatPercent >
        NET_GOLD_DAILY_INCREMENT_LIMIT_PERCENT
    ) {
      findings.push({
        severity: 'HIGH',
        code: 'WORLD_BOSS_DIRECT_GOLD_TOO_HIGH',
        scenario: row.scenario,
        tier: row.tier,
        message: `Após descontar o autocombate interrompido, todas as janelas aumentam o Gold diário em ${row.maxNetGoldDeltaVsEightHourAutoCombatPercent}%.`,
      });
    }
    if (
      row.scenario === 'CURRENT_RELIABLE' &&
      row.maxNetXpDeltaVsEightHourAutoCombatPercent >
        NET_XP_DAILY_INCREMENT_LIMIT_PERCENT
    ) {
      findings.push({
        severity: 'HIGH',
        code: 'WORLD_BOSS_DAILY_XP_TOO_HIGH',
        scenario: row.scenario,
        tier: row.tier,
        message: `Após descontar o autocombate interrompido, todas as janelas aumentam o XP diário em ${row.maxNetXpDeltaVsEightHourAutoCombatPercent}%.`,
      });
    }
    if (row.scenario === 'LOW_POPULATION' && row.victoryChancePercent < 85) {
      findings.push({
        severity: 'MEDIUM',
        code: 'LOW_POPULATION_VICTORY_BELOW_TARGET',
        scenario: row.scenario,
        tier: row.tier,
        message: `Baixa população vence ${row.victoryChancePercent}% das partidas simuladas.`,
      });
    }
    if (row.scenario === 'MIXED_GROUP' && row.victoryChancePercent < 90) {
      findings.push({
        severity: 'MEDIUM',
        code: 'MIXED_GROUP_VICTORY_BELOW_TARGET',
        scenario: row.scenario,
        tier: row.tier,
        message: `Grupo misto vence ${row.victoryChancePercent}% das partidas simuladas.`,
      });
    }
    if (row.scenario === 'CURRENT_RELIABLE') {
      if (
        row.fullPetRewardVictoriesPerCalendarDay >
        PET_BOSS_AVAILABILITY_TARGET.eligibleVictoriesPerCalendarDay
      ) {
        findings.push({
          severity: 'HIGH',
          code: 'PET_REWARD_DAILY_FREQUENCY_ABOVE_TARGET',
          scenario: row.scenario,
          tier: row.tier,
          message: `${row.fullPetRewardVictoriesPerCalendarDay} recompensa completa/dia supera a meta de ${PET_BOSS_AVAILABILITY_TARGET.eligibleVictoriesPerCalendarDay}.`,
        });
      }
      if (
        row.expectedPetInputDaysAtOneAttemptPerDay !== null &&
        (row.expectedPetInputDaysAtOneAttemptPerDay <
          PET_BOSS_AVAILABILITY_TARGET.minMedianCalendarDays ||
          row.expectedPetInputDaysAtOneAttemptPerDay >
            PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays)
      ) {
        findings.push({
          severity: 'HIGH',
          code: 'PET_INPUT_CASUAL_OUTSIDE_TARGET',
          scenario: row.scenario,
          tier: row.tier,
          message: `Jogador casual leva ${row.expectedPetInputDaysAtOneAttemptPerDay} dias para os insumos; a meta é ${PET_BOSS_AVAILABILITY_TARGET.minMedianCalendarDays}-${PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays}.`,
        });
      }
      if (
        row.expectedPetInputDaysAllWindows !== null &&
        (row.expectedPetInputDaysAllWindows <
          PET_BOSS_AVAILABILITY_TARGET.minMedianCalendarDays ||
          row.expectedPetInputDaysAllWindows >
            PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays)
      ) {
        findings.push({
          severity: 'HIGH',
          code: 'PET_INPUT_ACTIVE_OUTSIDE_TARGET',
          scenario: row.scenario,
          tier: row.tier,
          message: `Jogador ativo leva ${row.expectedPetInputDaysAllWindows} dias para os insumos; a meta é ${PET_BOSS_AVAILABILITY_TARGET.minMedianCalendarDays}-${PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays}.`,
        });
      }
      if (
        row.medianCocoonAttempts !== null &&
        row.medianCocoonAttempts >
          PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays
      ) {
        findings.push({
          severity: 'HIGH',
          code: 'PET_COCOON_MEDIAN_ABOVE_TARGET',
          scenario: row.scenario,
          tier: row.tier,
          message: `Mediana de ${row.medianCocoonAttempts} tentativas supera a meta de ${PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays}.`,
        });
      }
      if (
        row.p90CocoonAttempts !== null &&
        row.p90CocoonAttempts > PET_BOSS_AVAILABILITY_TARGET.maxP90CalendarDays
      ) {
        findings.push({
          severity: 'HIGH',
          code: 'PET_COCOON_P90_ABOVE_TARGET',
          scenario: row.scenario,
          tier: row.tier,
          message: `P90 de ${row.p90CocoonAttempts} tentativas supera a meta de ${PET_BOSS_AVAILABILITY_TARGET.maxP90CalendarDays}.`,
        });
      }
      if (
        row.p90CocoonCalendarDaysAllWindows !== null &&
        row.p90CocoonCalendarDaysAllWindows >
          PET_BOSS_AVAILABILITY_TARGET.maxP90CalendarDays
      ) {
        findings.push({
          severity: 'HIGH',
          code: 'PET_COCOON_ACTIVE_P90_ABOVE_TARGET',
          scenario: row.scenario,
          tier: row.tier,
          message: `P90 ativo de ${row.p90CocoonCalendarDaysAllWindows} dias supera a meta de ${PET_BOSS_AVAILABILITY_TARGET.maxP90CalendarDays}.`,
        });
      }
      if (
        row.expectedFragmentAttempts !== null &&
        row.expectedFragmentAttempts >
          PET_BOSS_AVAILABILITY_TARGET.maxVictoriesForGuaranteedFragments
      ) {
        findings.push({
          severity: 'HIGH',
          code: 'PET_FRAGMENTS_ABOVE_TARGET',
          scenario: row.scenario,
          tier: row.tier,
          message: `${row.expectedFragmentAttempts} tentativas esperadas para fragmentos superam a meta de ${PET_BOSS_AVAILABILITY_TARGET.maxVictoriesForGuaranteedFragments}.`,
        });
      }
    }
  }
  return findings;
}

export function buildWorldBossEconomySimulationReport(
  options: {
    iterationsPerBoss?: number;
    seed?: number;
    autoCombatNetGoldByTier?: Partial<Record<LaunchTier, number>>;
    autoCombatXpByTier?: Partial<Record<LaunchTier, number>>;
  } = {},
): WorldBossEconomySimulationReport {
  const iterationsPerBoss = Math.max(
    100,
    Math.floor(options.iterationsPerBoss ?? DEFAULT_ITERATIONS_PER_BOSS),
  );
  const seed = Math.floor(options.seed ?? DEFAULT_SEED) >>> 0;
  const random = createSeededRandom(seed);
  const profileLookup = getProfileLookup();
  const canonicalAutoCombatByTier = getAutoCombatByTier();
  const autoCombatByTier = new Map(
    ECONOMY_LAUNCH_TIERS.map((tier) => {
      const canonical = canonicalAutoCombatByTier.get(tier);
      return [
        tier,
        {
          netGoldPerHour:
            options.autoCombatNetGoldByTier?.[tier] ??
            canonical?.netGoldPerHour ??
            0,
          xpPerHour:
            options.autoCombatXpByTier?.[tier] ?? canonical?.xpPerHour ?? 0,
        },
      ] as const;
    }),
  );
  const launchBosses = worldBossDefinitions.filter((boss) => boss.tier <= 5);
  const bosses = WORLD_BOSS_ECONOMY_SCENARIOS.flatMap((scenario) =>
    launchBosses.map((boss) =>
      summarizeBoss({
        boss,
        scenario,
        iterations: iterationsPerBoss,
        profileLookup,
        random,
        autoCombatNetGoldPerHour:
          autoCombatByTier.get(boss.tier)?.netGoldPerHour ?? 0,
        autoCombatXpPerHour: autoCombatByTier.get(boss.tier)?.xpPerHour ?? 0,
      }),
    ),
  );
  const tiers = WORLD_BOSS_ECONOMY_SCENARIOS.flatMap((scenario) =>
    ECONOMY_LAUNCH_TIERS.map((tier) =>
      summarizeTier({
        tier,
        scenario,
        bosses,
        autoCombatNetGoldPerHour:
          autoCombatByTier.get(tier)?.netGoldPerHour ?? 0,
        autoCombatXpPerHour: autoCombatByTier.get(tier)?.xpPerHour ?? 0,
      }),
    ),
  );
  const findings = buildFindings(tiers);

  return {
    generatedAt: new Date().toISOString(),
    seed,
    iterationsPerBoss,
    simulatedMatches: bosses.reduce((total, row) => total + row.iterations, 0),
    source: 'CANONICAL_RULES_MONTE_CARLO',
    assumptions: {
      databaseWrites: false,
      classSelection:
        'As quatro classes têm a mesma probabilidade; cada perfil usa os atributos canônicos do boss e do set.',
      hpScaling:
        'HP é travado no início pelo TTK e DPS de escala do grupo, exatamente como no backend.',
      dropout:
        'O abandono planejado ocorre entre 25% e 125% do TTK-alvo; quem sai antes do término não recebe recompensa.',
      rewards:
        'Gold permanece integral. Em T2-T5, o XP das vitórias elegíveis usa 100% na primeira, 50% na segunda e 25% nas seguintes do tier/reset UTC; T1 permanece integral. A primeira vitória também usa chance cheia e o lote completo de fragmentos, e as seguintes usam 1% da chance-base e entregam um fragmento.',
      calendar:
        'O máximo diário pressupõe inscrição em todas as janelas, um casulo por tier/reset UTC e soma duração média mais respawn.',
    },
    scenarios: WORLD_BOSS_ECONOMY_SCENARIOS,
    bosses,
    tiers,
    findings,
    assessment: findings.some((finding) => finding.severity === 'HIGH')
      ? 'ATTENTION'
      : 'HEALTHY_WITH_ASSUMPTIONS',
  };
}

export function validateWorldBossEconomySimulationReport(
  report: WorldBossEconomySimulationReport,
) {
  const validations: Array<{ key: string; passed: boolean; detail: string }> =
    [];
  const expectedBossRows =
    WORLD_BOSS_ECONOMY_SCENARIOS.length *
    worldBossDefinitions.filter((boss) => boss.tier <= 5).length;
  const expectedTierRows =
    WORLD_BOSS_ECONOMY_SCENARIOS.length * ECONOMY_LAUNCH_TIERS.length;
  validations.push({
    key: 'BOSS_SCENARIO_COVERAGE',
    passed: report.bosses.length === expectedBossRows,
    detail: `${report.bosses.length}/${expectedBossRows}`,
  });
  validations.push({
    key: 'TIER_SCENARIO_COVERAGE',
    passed: report.tiers.length === expectedTierRows,
    detail: `${report.tiers.length}/${expectedTierRows}`,
  });
  for (const row of report.tiers.filter(
    (candidate) => candidate.scenario === 'CURRENT_RELIABLE',
  )) {
    validations.push({
      key: `CURRENT_RELIABLE_VICTORY:T${row.tier}`,
      passed: row.victoryChancePercent === 100,
      detail: `${row.victoryChancePercent}%`,
    });
    validations.push({
      key: `CURRENT_RELIABLE_PET_P90:T${row.tier}`,
      passed:
        row.p90CocoonAttempts !== null &&
        row.p90CocoonAttempts <=
          PET_BOSS_AVAILABILITY_TARGET.maxP90CalendarDays,
      detail: `${row.p90CocoonAttempts ?? 'N/D'} tentativas`,
    });
    validations.push({
      key: `CURRENT_RELIABLE_DIRECT_GOLD:T${row.tier}`,
      passed:
        row.maxNetGoldDeltaVsEightHourAutoCombatPercent <=
        NET_GOLD_DAILY_INCREMENT_LIMIT_PERCENT,
      detail: `${row.maxNetGoldDeltaVsEightHourAutoCombatPercent}%`,
    });
    validations.push({
      key: `CURRENT_RELIABLE_DAILY_XP:T${row.tier}`,
      passed:
        row.maxNetXpDeltaVsEightHourAutoCombatPercent <=
        NET_XP_DAILY_INCREMENT_LIMIT_PERCENT,
      detail: `${row.maxNetXpDeltaVsEightHourAutoCombatPercent}%`,
    });
    validations.push({
      key: `CURRENT_RELIABLE_PET_DAILY_RATE:T${row.tier}`,
      passed:
        row.fullPetRewardVictoriesPerCalendarDay <=
        PET_BOSS_AVAILABILITY_TARGET.eligibleVictoriesPerCalendarDay,
      detail: `${row.fullPetRewardVictoriesPerCalendarDay} recompensa completa/dia`,
    });
    validations.push({
      key: `CURRENT_RELIABLE_PET_CASUAL_DAYS:T${row.tier}`,
      passed:
        row.expectedPetInputDaysAtOneAttemptPerDay !== null &&
        row.expectedPetInputDaysAtOneAttemptPerDay >=
          PET_BOSS_AVAILABILITY_TARGET.minMedianCalendarDays &&
        row.expectedPetInputDaysAtOneAttemptPerDay <=
          PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays,
      detail: `${row.expectedPetInputDaysAtOneAttemptPerDay ?? 'N/D'} dias`,
    });
    validations.push({
      key: `CURRENT_RELIABLE_PET_ACTIVE_DAYS:T${row.tier}`,
      passed:
        row.expectedPetInputDaysAllWindows !== null &&
        row.expectedPetInputDaysAllWindows >=
          PET_BOSS_AVAILABILITY_TARGET.minMedianCalendarDays &&
        row.expectedPetInputDaysAllWindows <=
          PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays,
      detail: `${row.expectedPetInputDaysAllWindows ?? 'N/D'} dias`,
    });
  }
  return validations;
}

function toCsv<T extends object>(rows: T[]) {
  const headers = Object.keys(rows[0] ?? {});
  return [
    headers.join(';'),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = (row as Record<string, unknown>)[header];
          let serialized = '';
          if (typeof value === 'object' && value !== null) {
            serialized = JSON.stringify(value);
          } else if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
          ) {
            serialized = String(value);
          }
          return `"${serialized.replace(/"/g, '""')}"`;
        })
        .join(';'),
    ),
  ].join('\n');
}

function buildReadme(report: WorldBossEconomySimulationReport) {
  const reliableRows = report.tiers.filter(
    (row) => row.scenario === 'CURRENT_RELIABLE',
  );
  const lowPopulationRows = report.tiers.filter(
    (row) => row.scenario === 'LOW_POPULATION',
  );
  const table = (rows: WorldBossEconomyTierSummary[]) =>
    rows
      .map(
        (row) =>
          `| T${row.tier} | ${row.victoryChancePercent}% | ${row.averageDurationMinutes} min | ${row.goldPerRegistration} | ${row.maxNetGoldDeltaVsEightHourAutoCombatPercent}% | ${row.maxNetXpDeltaVsEightHourAutoCombatPercent}% | ${row.cocoonChancePerRegistrationPercent}% | ${row.activeDailyCocoonChancePercent}% | ${row.expectedPetInputDaysAtOneAttemptPerDay ?? 'N/D'} | ${row.expectedPetInputDaysAllWindows ?? 'N/D'} |`,
      )
      .join('\n');
  const findings =
    report.findings.length > 0
      ? report.findings
          .map(
            (finding) =>
              `- **${finding.severity} ${finding.code} T${finding.tier}:** ${finding.message}`,
          )
          .join('\n')
      : '- Nenhum limite econômico ou de disponibilidade foi violado.';

  return (
    `# Simulação econômica de partidas de World Boss\n\n` +
    `Gerado em ${report.generatedAt}. Foram simuladas **${report.simulatedMatches.toLocaleString('pt-BR')} partidas** com seed \`${report.seed}\`, sem escrita no banco.\n\n` +
    `Esta é uma simulação Monte Carlo com as regras canônicas do backend, não telemetria real. O resultado serve para estimar comportamento e caudas de risco enquanto a amostra observada ainda é pequena.\n\n` +
    `## Set atual e grupo confiável\n\n` +
    `| Tier | Vitória | Duração média | Gold/tentativa | Variação líquida de Gold diário | Variação líquida de XP diário | Casulo na 1ª vitória | Casulo/dia ativo | Dias casual | Dias ativo |\n` +
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${table(reliableRows)}\n\n` +
    `## Baixa população\n\n` +
    `| Tier | Vitória | Duração média | Gold/tentativa | Variação líquida de Gold diário | Variação líquida de XP diário | Casulo na 1ª vitória | Casulo/dia ativo | Dias casual | Dias ativo |\n` +
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${table(lowPopulationRows)}\n\n` +
    `## Premissas\n\n` +
    Object.values(report.assumptions)
      .filter((value) => typeof value === 'string')
      .map((value) => `- ${value}`)
      .join('\n') +
    `\n\n## Achados\n\n${findings}\n`
  );
}

export function writeWorldBossEconomySimulationReport(
  report: WorldBossEconomySimulationReport,
  outputDir: string,
) {
  const absoluteOutputDir = resolve(outputDir);
  mkdirSync(absoluteOutputDir, { recursive: true });
  writeFileSync(
    resolve(absoluteOutputDir, 'world-boss-match-simulation.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );
  writeFileSync(
    resolve(absoluteOutputDir, '01_resumo_por_tier.csv'),
    toCsv(report.tiers),
    'utf8',
  );
  writeFileSync(
    resolve(absoluteOutputDir, '02_resumo_por_boss.csv'),
    toCsv(report.bosses),
    'utf8',
  );
  writeFileSync(
    resolve(absoluteOutputDir, 'README.md'),
    buildReadme(report),
    'utf8',
  );
}

function parseIntegerArg(prefix: string, fallback: number) {
  const raw = process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function main() {
  const iterationsPerBoss = parseIntegerArg(
    '--iterations=',
    DEFAULT_ITERATIONS_PER_BOSS,
  );
  const seed = parseIntegerArg('--seed=', DEFAULT_SEED);
  const report = buildWorldBossEconomySimulationReport({
    iterationsPerBoss,
    seed,
  });
  const validations = validateWorldBossEconomySimulationReport(report);
  const failures = validations.filter((validation) => !validation.passed);
  const outputDir = process.argv
    .find((arg) => arg.startsWith('--output-dir='))
    ?.slice('--output-dir='.length);

  console.log(
    `World Boss Monte Carlo: ${report.simulatedMatches.toLocaleString('pt-BR')} partidas; avaliação ${report.assessment}.`,
  );
  console.table(
    report.tiers.map((row) => ({
      Cenário: row.scenario,
      Tier: row.tier,
      'Vitória %': row.victoryChancePercent,
      'Abandono %': row.actualAbandonmentPercent,
      'Duração min': row.averageDurationMinutes,
      'Gold/tentativa': row.goldPerRegistration,
      'Variação Gold diário %': row.maxNetGoldDeltaVsEightHourAutoCombatPercent,
      'Variação XP diário %': row.maxNetXpDeltaVsEightHourAutoCombatPercent,
      'Casulo 1ª vitória %': row.cocoonChancePerRegistrationPercent,
      'Casulo ativo/dia %': row.activeDailyCocoonChancePercent,
      'Dias pet casual': row.expectedPetInputDaysAtOneAttemptPerDay,
      'Dias pet ativo': row.expectedPetInputDaysAllWindows,
    })),
  );
  console.log(
    `Validações: ${validations.length - failures.length}/${validations.length} aprovadas.`,
  );
  if (failures.length > 0) console.table(failures);
  if (report.findings.length > 0) console.table(report.findings);

  if (outputDir) {
    writeWorldBossEconomySimulationReport(report, outputDir);
    console.log(`Relatório exportado em ${resolve(outputDir)}.`);
  }
  if (process.argv.includes('--strict') && failures.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
