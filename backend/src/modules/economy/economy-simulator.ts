import {
  getPetDuplicateCocoonRecovery,
  PET_DEFINITIONS,
  T1_ECONOMY_CONFIG,
} from '../../common/config/economy.config';
import { getWorldBossCollectiveRewardMultiplier } from '../../common/config/world-boss.config';
import {
  createFallbackWorldBossSimulationCalibration,
  type WorldBossSimulationCalibration,
} from './world-boss-simulation-calibration';

type SimulationProfile = (typeof T1_ECONOMY_CONFIG.simulation.profiles)[number];
type WorldBossSimulationSlot =
  (typeof T1_ECONOMY_CONFIG.simulation.worldBossCalendar.slots)[number];
type PetSpecialization = (typeof PET_DEFINITIONS)[number]['specialization'];

const T1_PET_DEFINITIONS = PET_DEFINITIONS.filter(
  (definition) => definition.tier === T1_ECONOMY_CONFIG.tier,
);
const T1_PET_SPECIALIZATIONS = Object.freeze(
  T1_PET_DEFINITIONS.map((definition) => definition.specialization),
);
const T1_PET_DUPLICATE_RECOVERY = getPetDuplicateCocoonRecovery(
  T1_ECONOMY_CONFIG.tier,
)!;

export type ReinforcementSimulationStrategy = 'BALANCED' | 'FOCUSED';

type GoldSource =
  | 'STARTING_GRANT'
  | 'MISSIONS'
  | 'INCURSION_REFUNDS'
  | 'WORLD_BOSS_REWARDS';

type GoldSink =
  | 'CONSUMABLES'
  | 'CRAFTING'
  | 'INCURSION_ENTRIES'
  | 'REINFORCEMENT'
  | 'PET_INCUBATION';

type GoldSourceBreakdown = Record<GoldSource, number>;
type GoldSinkBreakdown = Record<GoldSink, number>;

export interface T1EconomySimulationOptions {
  players?: number;
  days?: number;
  seed?: number;
  reinforcementStrategy?: ReinforcementSimulationStrategy;
}

export interface T1EconomySimulationProfileResult {
  key: SimulationProfile['key'];
  label: string;
  players: number;
  firstEquipmentMinutesP50: number | null;
  firstEquipmentMinutesP90: number | null;
  fullSetHoursP50: number | null;
  fullSetCompletionPercent: number;
  averageGoldEarned: number;
  averageGoldSpent: number;
  averageClosingGold: number;
  totalGoldEarned: number;
  totalGoldSpent: number;
  netGoldCreated: number;
  goldSinkRatioPercent: number;
  recurringGoldSinkRatioPercent: number;
  goldGeneratedBySource: GoldSourceBreakdown;
  goldDestroyedBySink: GoldSinkBreakdown;
  averageEquipmentCrafted: number;
  averageUpgradeLevels: number;
  playersWithReinforcementPercent: number;
  playersWithPlus3Percent: number;
  averageEquipmentAtLeastPlus1: number;
  averageEquipmentAtLeastPlus2: number;
  averageEquipmentAtPlus3: number;
  averageReinforcementFragments: number;
  averageIncursionTokens: number;
  averageIncursionTokensSpent: number;
  averageWorldBossFragments: number;
  averageWorldBossEligibleEvents: number;
  averageWorldBossEventsJoined: number;
  averageWorldBossRewardsClaimed: number;
  averageWorldBossFullRewards: number;
  averageWorldBossPartialRewards: number;
  averageWorldBossMissedByLevel: number;
  averageWorldBossMissedWhileOffline: number;
  averageWorldBossMissedByChoiceOrConflict: number;
  averageWorldBossMissedParticipation: number;
  averageWorldBossParticipationMinutes: number;
  averagePetCocoonsDropped: number;
  averagePetsIncubated: number;
  averageUniquePetsOwned: number;
  playersWithAnyPetPercent: number;
  playersWithCompletePetSetPercent: number;
  averageDuplicateCocoonsConverted: number;
  averageCocoonsHeld: number;
  averagePendingPetIncubations: number;
}

export interface SimulatedWorldBossEvent {
  id: string;
  slotIndex: WorldBossSimulationSlot['index'];
  slotKey: WorldBossSimulationSlot['key'];
  sequence: number;
  createdAtMinute: number;
  startsAtMinute: number;
  entryClosesAtMinute: number;
  closesAtMinute: number;
  outcome: 'EMPTY' | 'DEFEATED' | 'EXPIRED';
  defeated: boolean;
  progressRatio: number;
  rewardMultiplier: number;
  resolvedWithinWindow: boolean;
}

export interface T1EconomyWorldBossCalendarResult {
  scheduledEvents: number;
  resolvedEvents: number;
  emptyEvents: number;
  activatedEvents: number;
  defeatedEvents: number;
  expiredEvents: number;
  averageEventsPerDay: number;
  slots: Array<{
    index: WorldBossSimulationSlot['index'];
    key: WorldBossSimulationSlot['key'];
    label: string;
    respawnMinutes: number;
    scheduledEvents: number;
    resolvedEvents: number;
    emptyEvents: number;
    activatedEvents: number;
    defeatedEvents: number;
    expiredEvents: number;
  }>;
}

export interface T1EconomySimulationReport {
  generatedAt: string;
  options: Required<T1EconomySimulationOptions>;
  assumptions: typeof T1_ECONOMY_CONFIG.simulation;
  worldBossCalibration: WorldBossSimulationCalibration;
  worldBossCalendar: T1EconomyWorldBossCalendarResult;
  overall: Omit<T1EconomySimulationProfileResult, 'key' | 'label'>;
  profiles: T1EconomySimulationProfileResult[];
  targetAssessment: {
    profile: string;
    firstEquipmentWithinTarget: boolean;
    fullSetWithinTarget: boolean;
    goldSinkRatioWithinTarget: boolean;
    warnings: string[];
  };
}

interface PlayerResult {
  profile: SimulationProfile;
  firstEquipmentActiveMinutes: number | null;
  fullSetActiveMinutes: number | null;
  goldEarned: number;
  goldSpent: number;
  closingGold: number;
  goldGeneratedBySource: GoldSourceBreakdown;
  goldDestroyedBySink: GoldSinkBreakdown;
  equipmentCrafted: number;
  upgradeLevels: number;
  equipmentAtLeastPlus1: number;
  equipmentAtLeastPlus2: number;
  equipmentAtPlus3: number;
  reinforcementFragments: number;
  incursionTokens: number;
  incursionTokensSpent: number;
  worldBossFragments: number;
  worldBossEligibleEvents: number;
  worldBossEventsJoined: number;
  worldBossRewardsClaimed: number;
  worldBossFullRewards: number;
  worldBossPartialRewards: number;
  worldBossMissedByLevel: number;
  worldBossMissedWhileOffline: number;
  worldBossMissedByChoiceOrConflict: number;
  worldBossMissedParticipation: number;
  worldBossParticipationMinutes: number;
  petCocoonsDropped: number;
  petsIncubated: number;
  uniquePetsOwned: number;
  duplicateCocoonsConverted: number;
  cocoonsHeld: number;
  pendingPetIncubations: number;
}

interface PlayerState {
  gold: number;
  goldEarned: number;
  goldSpent: number;
  goldGeneratedBySource: GoldSourceBreakdown;
  goldDestroyedBySink: GoldSinkBreakdown;
  gatheringUnits: number;
  mobDropUnits: number;
  incursionTokens: number;
  incursionTokensSpent: number;
  reinforcementFragments: number;
  worldBossFragments: number;
  cocoonsBySpecialization: Record<PetSpecialization, number>;
  ownedPetSpecializations: Set<PetSpecialization>;
  pendingPetSpecialization: PetSpecialization | null;
  petIncubationEndsAtMinute: number | null;
  petCocoonsDropped: number;
  petsIncubated: number;
  duplicateCocoonsConverted: number;
  equipmentCrafted: number;
  upgradeLevels: number[];
  activeMinutes: number;
  firstEquipmentActiveMinutes: number | null;
  fullSetActiveMinutes: number | null;
}

interface PlayerOnlineWindow {
  dayIndex: number;
  startsAtMinute: number;
  endsAtMinute: number;
}

interface PlayerWorldBossReward {
  dayIndex: number;
  claimedAtMinute: number;
  defeated: boolean;
  rewardMultiplier: number;
}

interface PlayerWorldBossPlan {
  rewards: PlayerWorldBossReward[];
  activityBlockedMinutesByDay: number[];
  eligibleEvents: number;
  eventsJoined: number;
  rewardsClaimed: number;
  fullRewards: number;
  partialRewards: number;
  missedByLevel: number;
  missedWhileOffline: number;
  missedByChoiceOrConflict: number;
  missedParticipation: number;
  participationMinutes: number;
}

function createRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(
  random: () => number,
  range: { min: number; max: number },
) {
  return Math.floor(random() * (range.max - range.min + 1)) + range.min;
}

function sampleCount(random: () => number, expected: number) {
  const whole = Math.floor(expected);
  return whole + (random() < expected - whole ? 1 : 0);
}

export function buildWorldBossSimulationCalendar(
  days: number,
  random: () => number,
  calibration: WorldBossSimulationCalibration = createFallbackWorldBossSimulationCalibration(),
) {
  const config = T1_ECONOMY_CONFIG.simulation.worldBossCalendar;
  const simulationMinutes = days * config.minutesPerDay;
  const events: SimulatedWorldBossEvent[] = [];

  for (const slot of config.slots) {
    const slotCalibration =
      calibration.slots.find((candidate) => candidate.index === slot.index) ??
      createFallbackWorldBossSimulationCalibration().slots.find(
        (candidate) => candidate.index === slot.index,
      )!;
    let createdAtMinute = 0;
    let startsAtMinute = config.initialLobbyLeadMinutes;
    let sequence = 1;

    while (startsAtMinute < simulationMinutes) {
      const activated =
        random() * 100 < slotCalibration.activationChancePercent.value;
      const defeated =
        activated && random() * 100 < slotCalibration.defeatChancePercent.value;
      const outcome = !activated ? 'EMPTY' : defeated ? 'DEFEATED' : 'EXPIRED';
      const progressRatio =
        outcome === 'EMPTY'
          ? 0
          : defeated
            ? 1
            : randomInteger(
                random,
                slotCalibration.expiredProgressPercent.value,
              ) / 100;
      const activeDurationMinutes =
        outcome === 'EMPTY'
          ? config.entryWindowMinutes
          : defeated
            ? randomInteger(
                random,
                slotCalibration.defeatedDurationMinutes.value,
              )
            : config.eventDurationMinutes;
      const closesAtMinute = startsAtMinute + activeDurationMinutes;

      events.push({
        id: `${slot.key}-${sequence}`,
        slotIndex: slot.index,
        slotKey: slot.key,
        sequence,
        createdAtMinute,
        startsAtMinute,
        entryClosesAtMinute: startsAtMinute + config.entryWindowMinutes,
        closesAtMinute,
        outcome,
        defeated,
        progressRatio,
        rewardMultiplier:
          outcome === 'EMPTY'
            ? 0
            : getWorldBossCollectiveRewardMultiplier({
                defeated,
                progressRatio,
              }),
        resolvedWithinWindow: closesAtMinute <= simulationMinutes,
      });

      createdAtMinute = closesAtMinute;
      startsAtMinute = closesAtMinute + slot.respawnMinutes;
      sequence += 1;
    }
  }

  return events.sort(
    (left, right) =>
      left.startsAtMinute - right.startsAtMinute ||
      left.slotIndex - right.slotIndex,
  );
}

function summarizeWorldBossCalendar(
  events: SimulatedWorldBossEvent[],
  days: number,
): T1EconomyWorldBossCalendarResult {
  const resolvedEvents = events.filter((event) => event.resolvedWithinWindow);
  return {
    scheduledEvents: events.length,
    resolvedEvents: resolvedEvents.length,
    emptyEvents: resolvedEvents.filter((event) => event.outcome === 'EMPTY')
      .length,
    activatedEvents: resolvedEvents.filter((event) => event.outcome !== 'EMPTY')
      .length,
    defeatedEvents: resolvedEvents.filter(
      (event) => event.outcome === 'DEFEATED',
    ).length,
    expiredEvents: resolvedEvents.filter((event) => event.outcome === 'EXPIRED')
      .length,
    averageEventsPerDay: Number((events.length / days).toFixed(2)),
    slots: T1_ECONOMY_CONFIG.simulation.worldBossCalendar.slots.map((slot) => {
      const scheduled = events.filter(
        (event) => event.slotIndex === slot.index,
      );
      const resolved = scheduled.filter((event) => event.resolvedWithinWindow);
      return {
        index: slot.index,
        key: slot.key,
        label: slot.label,
        respawnMinutes: slot.respawnMinutes,
        scheduledEvents: scheduled.length,
        resolvedEvents: resolved.length,
        emptyEvents: resolved.filter((event) => event.outcome === 'EMPTY')
          .length,
        activatedEvents: resolved.filter((event) => event.outcome !== 'EMPTY')
          .length,
        defeatedEvents: resolved.filter((event) => event.outcome === 'DEFEATED')
          .length,
        expiredEvents: resolved.filter((event) => event.outcome === 'EXPIRED')
          .length,
      };
    }),
  };
}

function overlapMinutes(
  windows: PlayerOnlineWindow[],
  startsAtMinute: number,
  endsAtMinute: number,
) {
  return windows.reduce((total, window) => {
    const overlap = Math.max(
      0,
      Math.min(window.endsAtMinute, endsAtMinute) -
        Math.max(window.startsAtMinute, startsAtMinute),
    );
    return total + overlap;
  }, 0);
}

function firstOverlapMinute(
  windows: PlayerOnlineWindow[],
  startsAtMinute: number,
  endsAtMinute: number,
) {
  const overlappingWindow = windows.find(
    (window) =>
      window.startsAtMinute < endsAtMinute &&
      window.endsAtMinute > startsAtMinute,
  );
  return overlappingWindow
    ? Math.max(overlappingWindow.startsAtMinute, startsAtMinute)
    : null;
}

function buildPlayerOnlineWindows(
  profile: SimulationProfile,
  days: number,
  random: () => number,
) {
  const config = T1_ECONOMY_CONFIG.simulation.worldBossCalendar;
  const latestStartMinute = Math.max(
    0,
    config.minutesPerDay - profile.activeMinutesPerDay,
  );
  const habitualStartMinute = randomInteger(random, {
    min: 0,
    max: latestStartMinute,
  });

  return Array.from({ length: days }, (_, dayIndex) => {
    const jitter = randomInteger(random, {
      min: -config.habitualStartJitterMinutes,
      max: config.habitualStartJitterMinutes,
    });
    const startsWithinDay = Math.max(
      0,
      Math.min(latestStartMinute, habitualStartMinute + jitter),
    );
    const startsAtMinute = dayIndex * config.minutesPerDay + startsWithinDay;
    return {
      dayIndex,
      startsAtMinute,
      endsAtMinute: startsAtMinute + profile.activeMinutesPerDay,
    };
  });
}

function buildPlayerWorldBossPlan(
  profile: SimulationProfile,
  days: number,
  events: SimulatedWorldBossEvent[],
  random: () => number,
): PlayerWorldBossPlan {
  const config = T1_ECONOMY_CONFIG.simulation.worldBossCalendar;
  const onlineWindows = buildPlayerOnlineWindows(profile, days, random);
  const plan: PlayerWorldBossPlan = {
    rewards: [],
    activityBlockedMinutesByDay: Array.from({ length: days }, () => 0),
    eligibleEvents: 0,
    eventsJoined: 0,
    rewardsClaimed: 0,
    fullRewards: 0,
    partialRewards: 0,
    missedByLevel: 0,
    missedWhileOffline: 0,
    missedByChoiceOrConflict: 0,
    missedParticipation: 0,
    participationMinutes: 0,
  };
  let busyUntilMinute = 0;

  for (const event of events) {
    if (!event.resolvedWithinWindow) continue;
    if (event.outcome === 'EMPTY') continue;

    const eventDay =
      Math.floor(event.startsAtMinute / config.minutesPerDay) + 1;
    const eligibleFromDay =
      event.slotIndex === 0
        ? profile.worldBossEligibleFromDayBySlot[0]
        : profile.worldBossEligibleFromDayBySlot[1];
    if (eventDay < eligibleFromDay) {
      plan.missedByLevel += 1;
      continue;
    }
    plan.eligibleEvents += 1;

    const decisionWindowStartsAt = Math.max(
      event.createdAtMinute,
      event.startsAtMinute - config.joinDecisionLeadMinutes,
    );
    const joinedAtMinute = firstOverlapMinute(
      onlineWindows,
      decisionWindowStartsAt,
      event.entryClosesAtMinute,
    );
    if (joinedAtMinute === null) {
      plan.missedWhileOffline += 1;
      continue;
    }

    if (
      event.startsAtMinute < busyUntilMinute ||
      random() * 100 >= profile.worldBossJoinChancePercent
    ) {
      plan.missedByChoiceOrConflict += 1;
      continue;
    }

    plan.eventsJoined += 1;
    busyUntilMinute = event.closesAtMinute;
    const eventParticipationMinutes = overlapMinutes(
      onlineWindows,
      event.startsAtMinute,
      event.closesAtMinute,
    );
    plan.participationMinutes += eventParticipationMinutes;

    for (const window of onlineWindows) {
      plan.activityBlockedMinutesByDay[window.dayIndex] += overlapMinutes(
        [window],
        joinedAtMinute,
        event.closesAtMinute,
      );
    }

    if (eventParticipationMinutes < config.minimumParticipationMinutes) {
      plan.missedParticipation += 1;
      continue;
    }

    const rewardDay = Math.min(
      days - 1,
      Math.floor(event.closesAtMinute / config.minutesPerDay),
    );
    plan.rewards.push({
      dayIndex: rewardDay,
      claimedAtMinute: event.closesAtMinute,
      defeated: event.defeated,
      rewardMultiplier: event.rewardMultiplier,
    });
    plan.rewardsClaimed += 1;
    if (event.rewardMultiplier >= 1) plan.fullRewards += 1;
    else plan.partialRewards += 1;
  }

  return plan;
}

function percent(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}

function average(values: number[]) {
  return values.length
    ? Number(
        (
          values.reduce((total, value) => total + value, 0) / values.length
        ).toFixed(2),
      )
    : 0;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return Number(sorted[index].toFixed(2));
}

function selectProfile(random: () => number) {
  const roll = random() * 100;
  let threshold = 0;
  for (const profile of T1_ECONOMY_CONFIG.simulation.profiles) {
    threshold += profile.populationPercent;
    if (roll < threshold) return profile;
  }
  return T1_ECONOMY_CONFIG.simulation.profiles.at(-1)!;
}

function getNextMaterialCost(state: PlayerState) {
  const config = T1_ECONOMY_CONFIG;
  if (state.equipmentCrafted < config.crafting.equipmentSlotsPerSet) {
    return {
      gathering: config.crafting.gatheringUnitsPerEquipment,
      mobDrops: config.crafting.mobDropUnitsPerEquipment,
    };
  }

  return { gathering: 0, mobDrops: 0 };
}

function spendGold(state: PlayerState, quantity: number, sink: GoldSink) {
  if (quantity <= 0 || state.gold < quantity) return false;
  state.gold -= quantity;
  state.goldSpent += quantity;
  state.goldDestroyedBySink[sink] += quantity;
  return true;
}

function earnGold(state: PlayerState, quantity: number, source: GoldSource) {
  if (quantity <= 0) return;
  state.gold += quantity;
  state.goldEarned += quantity;
  state.goldGeneratedBySource[source] += quantity;
}

function progressEquipment(
  state: PlayerState,
  reinforcementStrategy: ReinforcementSimulationStrategy,
) {
  const config = T1_ECONOMY_CONFIG;
  while (
    state.equipmentCrafted < config.crafting.equipmentSlotsPerSet &&
    state.gatheringUnits >= config.crafting.gatheringUnitsPerEquipment &&
    state.mobDropUnits >= config.crafting.mobDropUnitsPerEquipment &&
    state.gold >= config.crafting.goldFeePerEquipment
  ) {
    state.gatheringUnits -= config.crafting.gatheringUnitsPerEquipment;
    state.mobDropUnits -= config.crafting.mobDropUnitsPerEquipment;
    spendGold(state, config.crafting.goldFeePerEquipment, 'CRAFTING');
    state.equipmentCrafted += 1;
    state.upgradeLevels.push(0);

    if (state.firstEquipmentActiveMinutes === null) {
      state.firstEquipmentActiveMinutes = state.activeMinutes;
    }
    if (
      state.equipmentCrafted === config.crafting.equipmentSlotsPerSet &&
      state.fullSetActiveMinutes === null
    ) {
      state.fullSetActiveMinutes = state.activeMinutes;
    }
  }

  if (state.equipmentCrafted < config.crafting.equipmentSlotsPerSet) return;

  while (true) {
    const equipmentIndex =
      reinforcementStrategy === 'FOCUSED'
        ? state.upgradeLevels.findIndex(
            (level) => level < config.upgrades.length,
          )
        : state.upgradeLevels.findIndex(
            (level) => level === Math.min(...state.upgradeLevels),
          );
    const currentLevel = state.upgradeLevels[equipmentIndex];
    const upgrade = config.upgrades[currentLevel];
    if (equipmentIndex < 0 || !upgrade) break;

    const missingFragments = Math.max(
      0,
      upgrade.reinforcementFragmentCost - state.reinforcementFragments,
    );
    const tokensToExchange = Math.min(
      state.incursionTokens,
      Math.ceil(
        missingFragments / config.incursion.reinforcementFragmentsPerToken,
      ),
    );
    if (tokensToExchange > 0) {
      state.incursionTokens -= tokensToExchange;
      state.incursionTokensSpent += tokensToExchange;
      state.reinforcementFragments +=
        tokensToExchange * config.incursion.reinforcementFragmentsPerToken;
    }

    if (
      state.reinforcementFragments < upgrade.reinforcementFragmentCost ||
      state.gold < upgrade.goldCost
    ) {
      break;
    }

    state.reinforcementFragments -= upgrade.reinforcementFragmentCost;
    spendGold(state, upgrade.goldCost, 'REINFORCEMENT');
    state.upgradeLevels[equipmentIndex] += 1;
  }
}

function createPetCocoonInventory() {
  return Object.fromEntries(
    T1_PET_SPECIALIZATIONS.map((specialization) => [specialization, 0]),
  ) as Record<PetSpecialization, number>;
}

function getMissingPetSpecializations(state: PlayerState) {
  return T1_PET_SPECIALIZATIONS.filter(
    (specialization) =>
      !state.ownedPetSpecializations.has(specialization) &&
      state.pendingPetSpecialization !== specialization,
  );
}

function recoverDuplicateCocoons(state: PlayerState) {
  for (const specialization of T1_PET_SPECIALIZATIONS) {
    const quantity = state.cocoonsBySpecialization[specialization];
    const reservedQuantity =
      state.ownedPetSpecializations.has(specialization) ||
      state.pendingPetSpecialization === specialization
        ? 0
        : 1;
    const duplicateQuantity = Math.max(0, quantity - reservedQuantity);
    if (duplicateQuantity === 0) continue;

    state.cocoonsBySpecialization[specialization] -= duplicateQuantity;
    state.worldBossFragments +=
      duplicateQuantity * T1_PET_DUPLICATE_RECOVERY.fragmentsPerCocoon;
    state.duplicateCocoonsConverted += duplicateQuantity;
  }
}

function findAvailablePetCocoon(state: PlayerState) {
  return (
    getMissingPetSpecializations(state).find(
      (specialization) => state.cocoonsBySpecialization[specialization] > 0,
    ) ?? null
  );
}

function startPetIncubation(state: PlayerState, startsAtMinute: number) {
  if (state.pendingPetSpecialization) return false;

  recoverDuplicateCocoons(state);
  const config = T1_ECONOMY_CONFIG.petIncubation;
  const specialization = findAvailablePetCocoon(state);
  if (
    !specialization ||
    state.worldBossFragments < config.fragmentCost ||
    state.gold < config.goldCost
  ) {
    return false;
  }

  state.cocoonsBySpecialization[specialization] -= 1;
  state.worldBossFragments -= config.fragmentCost;
  spendGold(state, config.goldCost, 'PET_INCUBATION');
  state.pendingPetSpecialization = specialization;
  state.petIncubationEndsAtMinute = startsAtMinute + config.durationHours * 60;
  return true;
}

function advancePetCollection(state: PlayerState, targetMinute: number) {
  while (
    state.pendingPetSpecialization &&
    state.petIncubationEndsAtMinute !== null &&
    state.petIncubationEndsAtMinute <= targetMinute
  ) {
    const completedAtMinute = state.petIncubationEndsAtMinute;
    state.ownedPetSpecializations.add(state.pendingPetSpecialization);
    state.petsIncubated += 1;
    state.pendingPetSpecialization = null;
    state.petIncubationEndsAtMinute = null;
    recoverDuplicateCocoons(state);
    startPetIncubation(state, completedAtMinute);
  }

  startPetIncubation(state, targetMinute);
}

function receiveRandomPetCocoon(state: PlayerState, random: () => number) {
  const specialization =
    T1_PET_SPECIALIZATIONS[
      randomInteger(random, {
        min: 0,
        max: T1_PET_SPECIALIZATIONS.length - 1,
      })
    ];
  state.cocoonsBySpecialization[specialization] += 1;
  state.petCocoonsDropped += 1;
  recoverDuplicateCocoons(state);
}

function simulatePlayer(
  profile: SimulationProfile,
  days: number,
  worldBossEvents: SimulatedWorldBossEvent[],
  playerSeed: number,
  reinforcementStrategy: ReinforcementSimulationStrategy,
): PlayerResult {
  const config = T1_ECONOMY_CONFIG;
  const incursionRandom = createRandom((playerSeed ^ 0x696e6375) >>> 0);
  const worldBossPlanRandom = createRandom((playerSeed ^ 0x7762706c) >>> 0);
  const worldBossRewardRandom = createRandom((playerSeed ^ 0x77627277) >>> 0);
  const petCocoonRandom = createRandom((playerSeed ^ 0x70657473) >>> 0);
  const worldBossPlan = buildPlayerWorldBossPlan(
    profile,
    days,
    worldBossEvents,
    worldBossPlanRandom,
  );
  const state: PlayerState = {
    gold: config.simulation.startingGold,
    goldEarned: config.simulation.startingGold,
    goldSpent: 0,
    goldGeneratedBySource: {
      STARTING_GRANT: config.simulation.startingGold,
      MISSIONS: 0,
      INCURSION_REFUNDS: 0,
      WORLD_BOSS_REWARDS: 0,
    },
    goldDestroyedBySink: {
      CONSUMABLES: 0,
      CRAFTING: 0,
      INCURSION_ENTRIES: 0,
      REINFORCEMENT: 0,
      PET_INCUBATION: 0,
    },
    gatheringUnits: 0,
    mobDropUnits: 0,
    incursionTokens: 0,
    incursionTokensSpent: 0,
    reinforcementFragments: 0,
    worldBossFragments: 0,
    cocoonsBySpecialization: createPetCocoonInventory(),
    ownedPetSpecializations: new Set<PetSpecialization>(),
    pendingPetSpecialization: null,
    petIncubationEndsAtMinute: null,
    petCocoonsDropped: 0,
    petsIncubated: 0,
    duplicateCocoonsConverted: 0,
    equipmentCrafted: 0,
    upgradeLevels: [],
    activeMinutes: 0,
    firstEquipmentActiveMinutes: null,
    fullSetActiveMinutes: null,
  };

  for (let day = 0; day < days; day += 1) {
    const dayStartsAtMinute =
      day * config.simulation.worldBossCalendar.minutesPerDay;
    const dayEndsAtMinute =
      (day + 1) * config.simulation.worldBossCalendar.minutesPerDay;
    advancePetCollection(state, dayStartsAtMinute);

    earnGold(state, profile.missionGoldPerDay, 'MISSIONS');
    spendGold(
      state,
      Math.min(profile.consumableGoldPerDay, Math.max(0, state.gold)),
      'CONSUMABLES',
    );

    const incursionAttempts = sampleCount(
      incursionRandom,
      profile.incursionAttemptsPerDay,
    );
    for (let attempt = 0; attempt < incursionAttempts; attempt += 1) {
      if (!spendGold(state, config.incursion.entryGold, 'INCURSION_ENTRIES')) {
        break;
      }
      if (incursionRandom() * 100 >= config.incursion.successChancePercent)
        continue;

      state.incursionTokens += randomInteger(
        incursionRandom,
        config.incursion.tokenReward,
      );
      state.reinforcementFragments += randomInteger(
        incursionRandom,
        config.incursion.reinforcementReward,
      );
      earnGold(state, config.incursion.successGoldRefund, 'INCURSION_REFUNDS');
    }

    const worldBossRewards = worldBossPlan.rewards
      .filter((reward) => reward.dayIndex === day)
      .sort((left, right) => left.claimedAtMinute - right.claimedAtMinute);
    for (const reward of worldBossRewards) {
      advancePetCollection(state, reward.claimedAtMinute);
      const goldReward = Math.floor(
        randomInteger(worldBossRewardRandom, config.worldBoss.goldReward) *
          reward.rewardMultiplier,
      );
      earnGold(state, goldReward, 'WORLD_BOSS_REWARDS');
      state.worldBossFragments += randomInteger(
        worldBossRewardRandom,
        config.worldBoss.fragmentReward,
      );
      if (
        reward.defeated &&
        worldBossRewardRandom() * 100 < config.worldBoss.cocoonChancePercent
      ) {
        receiveRandomPetCocoon(state, petCocoonRandom);
      }
      advancePetCollection(state, reward.claimedAtMinute);
    }

    const worldBossActivityBlockedMinutes = Math.min(
      profile.activeMinutesPerDay,
      worldBossPlan.activityBlockedMinutesByDay[day] ?? 0,
    );
    state.activeMinutes += worldBossActivityBlockedMinutes;
    const availableActivityMinutes = Math.max(
      0,
      profile.activeMinutesPerDay - worldBossActivityBlockedMinutes,
    );
    const activitySteps = Math.floor(
      availableActivityMinutes / config.simulation.stepMinutes,
    );
    for (let step = 0; step < activitySteps; step += 1) {
      const materialCost = getNextMaterialCost(state);
      const gatheringMinutesRemaining =
        Math.max(0, materialCost.gathering - state.gatheringUnits) /
        config.simulation.gatheringUnitsPerMinute;
      const combatMinutesRemaining =
        Math.max(0, materialCost.mobDrops - state.mobDropUnits) /
        config.simulation.mobDropUnitsPerMinute;

      if (gatheringMinutesRemaining >= combatMinutesRemaining) {
        state.gatheringUnits +=
          config.simulation.gatheringUnitsPerMinute *
          config.simulation.stepMinutes;
      } else {
        state.mobDropUnits +=
          config.simulation.mobDropUnitsPerMinute *
          config.simulation.stepMinutes;
      }
      state.activeMinutes += config.simulation.stepMinutes;
      progressEquipment(state, reinforcementStrategy);
    }
    advancePetCollection(state, dayEndsAtMinute);
  }

  return {
    profile,
    firstEquipmentActiveMinutes: state.firstEquipmentActiveMinutes,
    fullSetActiveMinutes: state.fullSetActiveMinutes,
    goldEarned: state.goldEarned,
    goldSpent: state.goldSpent,
    closingGold: state.gold,
    goldGeneratedBySource: state.goldGeneratedBySource,
    goldDestroyedBySink: state.goldDestroyedBySink,
    equipmentCrafted: state.equipmentCrafted,
    upgradeLevels: state.upgradeLevels.reduce(
      (total, level) => total + level,
      0,
    ),
    equipmentAtLeastPlus1: state.upgradeLevels.filter((level) => level >= 1)
      .length,
    equipmentAtLeastPlus2: state.upgradeLevels.filter((level) => level >= 2)
      .length,
    equipmentAtPlus3: state.upgradeLevels.filter(
      (level) => level >= config.upgrades.length,
    ).length,
    reinforcementFragments: state.reinforcementFragments,
    incursionTokens: state.incursionTokens,
    incursionTokensSpent: state.incursionTokensSpent,
    worldBossFragments: state.worldBossFragments,
    worldBossEligibleEvents: worldBossPlan.eligibleEvents,
    worldBossEventsJoined: worldBossPlan.eventsJoined,
    worldBossRewardsClaimed: worldBossPlan.rewardsClaimed,
    worldBossFullRewards: worldBossPlan.fullRewards,
    worldBossPartialRewards: worldBossPlan.partialRewards,
    worldBossMissedByLevel: worldBossPlan.missedByLevel,
    worldBossMissedWhileOffline: worldBossPlan.missedWhileOffline,
    worldBossMissedByChoiceOrConflict: worldBossPlan.missedByChoiceOrConflict,
    worldBossMissedParticipation: worldBossPlan.missedParticipation,
    worldBossParticipationMinutes: worldBossPlan.participationMinutes,
    petCocoonsDropped: state.petCocoonsDropped,
    petsIncubated: state.petsIncubated,
    uniquePetsOwned: state.ownedPetSpecializations.size,
    duplicateCocoonsConverted: state.duplicateCocoonsConverted,
    cocoonsHeld: Object.values(state.cocoonsBySpecialization).reduce(
      (total, quantity) => total + quantity,
      0,
    ),
    pendingPetIncubations: state.pendingPetSpecialization ? 1 : 0,
  };
}

function summarize(
  players: PlayerResult[],
): Omit<T1EconomySimulationProfileResult, 'key' | 'label'> {
  const firstEquipmentMinutes = players
    .map((player) => player.firstEquipmentActiveMinutes)
    .filter((value): value is number => value !== null);
  const fullSetMinutes = players
    .map((player) => player.fullSetActiveMinutes)
    .filter((value): value is number => value !== null);
  const totalGoldEarned = players.reduce(
    (total, player) => total + player.goldEarned,
    0,
  );
  const totalGoldSpent = players.reduce(
    (total, player) => total + player.goldSpent,
    0,
  );
  const goldGeneratedBySource: GoldSourceBreakdown = {
    STARTING_GRANT: players.reduce(
      (total, player) => total + player.goldGeneratedBySource.STARTING_GRANT,
      0,
    ),
    MISSIONS: players.reduce(
      (total, player) => total + player.goldGeneratedBySource.MISSIONS,
      0,
    ),
    INCURSION_REFUNDS: players.reduce(
      (total, player) => total + player.goldGeneratedBySource.INCURSION_REFUNDS,
      0,
    ),
    WORLD_BOSS_REWARDS: players.reduce(
      (total, player) =>
        total + player.goldGeneratedBySource.WORLD_BOSS_REWARDS,
      0,
    ),
  };
  const goldDestroyedBySink: GoldSinkBreakdown = {
    CONSUMABLES: players.reduce(
      (total, player) => total + player.goldDestroyedBySink.CONSUMABLES,
      0,
    ),
    CRAFTING: players.reduce(
      (total, player) => total + player.goldDestroyedBySink.CRAFTING,
      0,
    ),
    INCURSION_ENTRIES: players.reduce(
      (total, player) => total + player.goldDestroyedBySink.INCURSION_ENTRIES,
      0,
    ),
    REINFORCEMENT: players.reduce(
      (total, player) => total + player.goldDestroyedBySink.REINFORCEMENT,
      0,
    ),
    PET_INCUBATION: players.reduce(
      (total, player) => total + player.goldDestroyedBySink.PET_INCUBATION,
      0,
    ),
  };
  const recurringGoldGenerated =
    totalGoldEarned - goldGeneratedBySource.STARTING_GRANT;

  return {
    players: players.length,
    firstEquipmentMinutesP50: percentile(firstEquipmentMinutes, 0.5),
    firstEquipmentMinutesP90: percentile(firstEquipmentMinutes, 0.9),
    fullSetHoursP50:
      fullSetMinutes.length > 0
        ? Number(((percentile(fullSetMinutes, 0.5) ?? 0) / 60).toFixed(2))
        : null,
    fullSetCompletionPercent: percent(fullSetMinutes.length, players.length),
    averageGoldEarned: average(players.map((player) => player.goldEarned)),
    averageGoldSpent: average(players.map((player) => player.goldSpent)),
    averageClosingGold: average(players.map((player) => player.closingGold)),
    totalGoldEarned,
    totalGoldSpent,
    netGoldCreated: totalGoldEarned - totalGoldSpent,
    goldSinkRatioPercent: percent(totalGoldSpent, totalGoldEarned),
    recurringGoldSinkRatioPercent: percent(
      totalGoldSpent,
      recurringGoldGenerated,
    ),
    goldGeneratedBySource,
    goldDestroyedBySink,
    averageEquipmentCrafted: average(
      players.map((player) => player.equipmentCrafted),
    ),
    averageUpgradeLevels: average(
      players.map((player) => player.upgradeLevels),
    ),
    playersWithReinforcementPercent: percent(
      players.filter((player) => player.upgradeLevels > 0).length,
      players.length,
    ),
    playersWithPlus3Percent: percent(
      players.filter((player) => player.equipmentAtPlus3 > 0).length,
      players.length,
    ),
    averageEquipmentAtLeastPlus1: average(
      players.map((player) => player.equipmentAtLeastPlus1),
    ),
    averageEquipmentAtLeastPlus2: average(
      players.map((player) => player.equipmentAtLeastPlus2),
    ),
    averageEquipmentAtPlus3: average(
      players.map((player) => player.equipmentAtPlus3),
    ),
    averageReinforcementFragments: average(
      players.map((player) => player.reinforcementFragments),
    ),
    averageIncursionTokens: average(
      players.map((player) => player.incursionTokens),
    ),
    averageIncursionTokensSpent: average(
      players.map((player) => player.incursionTokensSpent),
    ),
    averageWorldBossFragments: average(
      players.map((player) => player.worldBossFragments),
    ),
    averageWorldBossEligibleEvents: average(
      players.map((player) => player.worldBossEligibleEvents),
    ),
    averageWorldBossEventsJoined: average(
      players.map((player) => player.worldBossEventsJoined),
    ),
    averageWorldBossRewardsClaimed: average(
      players.map((player) => player.worldBossRewardsClaimed),
    ),
    averageWorldBossFullRewards: average(
      players.map((player) => player.worldBossFullRewards),
    ),
    averageWorldBossPartialRewards: average(
      players.map((player) => player.worldBossPartialRewards),
    ),
    averageWorldBossMissedByLevel: average(
      players.map((player) => player.worldBossMissedByLevel),
    ),
    averageWorldBossMissedWhileOffline: average(
      players.map((player) => player.worldBossMissedWhileOffline),
    ),
    averageWorldBossMissedByChoiceOrConflict: average(
      players.map((player) => player.worldBossMissedByChoiceOrConflict),
    ),
    averageWorldBossMissedParticipation: average(
      players.map((player) => player.worldBossMissedParticipation),
    ),
    averageWorldBossParticipationMinutes: average(
      players.map((player) => player.worldBossParticipationMinutes),
    ),
    averagePetCocoonsDropped: average(
      players.map((player) => player.petCocoonsDropped),
    ),
    averagePetsIncubated: average(
      players.map((player) => player.petsIncubated),
    ),
    averageUniquePetsOwned: average(
      players.map((player) => player.uniquePetsOwned),
    ),
    playersWithAnyPetPercent: percent(
      players.filter((player) => player.uniquePetsOwned > 0).length,
      players.length,
    ),
    playersWithCompletePetSetPercent: percent(
      players.filter(
        (player) => player.uniquePetsOwned === T1_PET_SPECIALIZATIONS.length,
      ).length,
      players.length,
    ),
    averageDuplicateCocoonsConverted: average(
      players.map((player) => player.duplicateCocoonsConverted),
    ),
    averageCocoonsHeld: average(players.map((player) => player.cocoonsHeld)),
    averagePendingPetIncubations: average(
      players.map((player) => player.pendingPetIncubations),
    ),
  };
}

function isBetween(value: number | null, min: number, max: number) {
  return value !== null && value >= min && value <= max;
}

export function simulateT1Economy(
  options: T1EconomySimulationOptions = {},
  worldBossCalibration: WorldBossSimulationCalibration = createFallbackWorldBossSimulationCalibration(),
): T1EconomySimulationReport {
  const resolvedOptions = {
    players: Math.max(1, Math.floor(options.players ?? 1000)),
    days: Math.max(1, Math.floor(options.days ?? 7)),
    seed: Math.floor(options.seed ?? 20260824),
    reinforcementStrategy: options.reinforcementStrategy ?? 'BALANCED',
  };
  const profileRandom = createRandom(resolvedOptions.seed);
  const worldBossEvents = buildWorldBossSimulationCalendar(
    resolvedOptions.days,
    createRandom((resolvedOptions.seed ^ 0x77626f73) >>> 0),
    worldBossCalibration,
  );
  const players = Array.from(
    { length: resolvedOptions.players },
    (_, index) => {
      const profile = selectProfile(profileRandom);
      const playerSeed =
        (resolvedOptions.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
      return simulatePlayer(
        profile,
        resolvedOptions.days,
        worldBossEvents,
        playerSeed,
        resolvedOptions.reinforcementStrategy,
      );
    },
  );
  const profiles = T1_ECONOMY_CONFIG.simulation.profiles.map((profile) => ({
    key: profile.key,
    label: profile.label,
    ...summarize(
      players.filter((player) => player.profile.key === profile.key),
    ),
  }));
  const targetProfile = profiles.find(
    (profile) => profile.key === T1_ECONOMY_CONFIG.simulation.targetProfile,
  )!;
  const targets = T1_ECONOMY_CONFIG.targets;
  const firstEquipmentWithinTarget = isBetween(
    targetProfile.firstEquipmentMinutesP50,
    targets.firstEquipmentMinutes.min,
    targets.firstEquipmentMinutes.max,
  );
  const fullSetWithinTarget = isBetween(
    targetProfile.fullSetHoursP50,
    targets.fullSetHours.min,
    targets.fullSetHours.max,
  );
  const goldSinkRatioWithinTarget = isBetween(
    targetProfile.goldSinkRatioPercent,
    targets.sevenDayGoldSinkRatioPercent.min,
    targets.sevenDayGoldSinkRatioPercent.max,
  );
  const warnings = [
    !firstEquipmentWithinTarget
      ? 'O tempo mediano ate o primeiro equipamento esta fora da meta.'
      : null,
    !fullSetWithinTarget
      ? 'O tempo ativo mediano ate o conjunto T1 esta fora da meta.'
      : null,
    !goldSinkRatioWithinTarget
      ? 'A relacao de destruicao de Gold esta fora da faixa de 60% a 80%.'
      : null,
  ].filter((warning): warning is string => warning !== null);

  return {
    generatedAt: new Date().toISOString(),
    options: resolvedOptions,
    assumptions: T1_ECONOMY_CONFIG.simulation,
    worldBossCalibration,
    worldBossCalendar: summarizeWorldBossCalendar(
      worldBossEvents,
      resolvedOptions.days,
    ),
    overall: summarize(players),
    profiles,
    targetAssessment: {
      profile: targetProfile.label,
      firstEquipmentWithinTarget,
      fullSetWithinTarget,
      goldSinkRatioWithinTarget,
      warnings,
    },
  };
}
