type PayloadRecord = Record<string, unknown>;

const STATUS_KEYS = [
  'active',
  'hasActiveAutoCombat',
  'message',
  'serverNow',
  'snapshotSequence',
  'latestEventSequence',
  'phase',
  'nextActor',
  'lastActionAt',
  'nextActionAt',
  'roundDurationSeconds',
  'currentMapId',
  'currentSubMapId',
  'canTravel',
  'huntCapacity',
  'hasPreservedTrackedEnemies',
  'preservedTrackedEnemiesCount',
  'autoCombatRecovery',
  'endReason',
  'shouldRedirectToInfirmary',
] as const;

const SESSION_KEYS = [
  'id',
  'characterId',
  'mapId',
  'subMapId',
  'status',
  'phase',
  'endReason',
  'shouldRedirectToInfirmary',
  'hasPreservedTrackedEnemies',
  'preservedTrackedEnemiesCount',
  'autoCombatRecovery',
  'startedAt',
  'endsAt',
  'lastProcessedAt',
  'finishedAt',
  'durationSeconds',
  'roundDurationSeconds',
  'remainingSeconds',
  'totalCombatsResolved',
  'totalRoundsResolved',
  'totalXpGained',
  'baseXpGained',
  'premiumBonusXp',
  'premiumPotentialBonusXp',
  'premiumTotalXp',
  'isPremiumActive',
  'totalPotionsUsed',
  'totalCombats',
  'totalRounds',
  'totalKills',
  'totalLoot',
  'potionsUsed',
  'currentMobId',
  'currentMobHp',
  'currentMobMaxHp',
  'killProgressSeconds',
  'killProgressMs',
  'estimatedKillTimeSeconds',
  'estimatedKillTimeMs',
  'unmodifiedKillTimeMs',
  'baseKillTimeSeconds',
  'appliedTtkPetBonus',
  'playerOffensivePower',
  'monsterRecommendedPower',
  'currentMobIndex',
  'currentRound',
  'currentCombatIndex',
  'huntStartedAt',
  'huntStoppedAt',
  'lastHuntProcessedAt',
  'huntingLevelAtStart',
  'huntingXpGained',
  'foundEnemiesCount',
  'availableEnemiesCount',
  'remainingEnemiesCount',
  'maxTrackedEnemies',
  'remainingHuntCapacity',
  'isHuntLimitReached',
  'bonusEnemiesFound',
  'selectedEncounterId',
  'selectedEncounterMobId',
  'battleTargetMobId',
  'battleTargetEncounterId',
  'battleTargetTotal',
  'battleTargetRemaining',
  'enemyInstanceId',
  'currentEnemyInstanceId',
  'snapshotSequence',
  'latestEventSequence',
  'nextActor',
  'lastActionAt',
  'nextActionAt',
] as const;

const CHARACTER_KEYS = [
  'id',
  'name',
  'class',
  'level',
  'xp',
  'totalXp',
  'currentHp',
  'maxHp',
  'currentLevelXp',
  'xpToNextLevel',
  'nextLevelXp',
  'xpProgressPercent',
  'xpIntoCurrentLevel',
  'xpNeededForNextLevel',
  'currentLevelStartXp',
  'nextLevelRequiredXp',
  'isAtLevelCap',
  'levelProgress',
] as const;

const MOB_KEYS = [
  'id',
  'enemyInstanceId',
  'name',
  'description',
  'level',
  'tier',
  'hp',
  'currentHp',
  'maxHp',
  'hpPercent',
  'attack',
  'defense',
  'speed',
  'xpReward',
  'iconUrl',
  'imageUrl',
  'assetKey',
  'foundCount',
  'huntFoundCount',
  'survivalProjection',
] as const;

const BATTLE_PROGRESS_KEYS = [
  'activityInstanceId',
  'enemyInstanceId',
  'progressSeconds',
  'progressPercent',
  'cycleStartedAt',
  'cycleEndsAt',
  'cycleDurationMs',
  'cycleDurationSeconds',
  'remainingMs',
  'progressUpdatedAt',
  'serverNow',
  'estimatedKillTimeSeconds',
  'estimatedKillTimeMs',
  'unmodifiedKillTimeMs',
  'baseKillTimeSeconds',
  'appliedPetBonus',
  'playerOffensivePower',
  'monsterRecommendedPower',
  'killsPerMinute',
  'killsPerHour',
  'difficultyLabel',
  'mobIndex',
  'tier',
] as const;

const HUNTING_KEYS = [
  'timeline',
  'mapId',
  'subMapId',
  'phase',
  'startedAt',
  'stoppedAt',
  'lastProcessedAt',
  'cycleStartedAt',
  'cycleEndsAt',
  'cycleDurationMs',
  'cycleVersion',
  'appliedPetBonus',
  'lastFindAt',
  'nextFindAt',
  'foundEnemiesCount',
  'availableEnemiesCount',
  'remainingEnemiesCount',
  'maxTrackedEnemies',
  'remainingCapacity',
  'isLimitReached',
  'bonusEnemiesFound',
  'huntingXpGained',
  'baseSecondsPerEnemy',
  'secondsPerEnemy',
  'secondsPerFind',
  'elapsedSeconds',
  'remainingSeconds',
  'progressPercent',
  'foundEnemySequence',
  'currentTargetSequence',
  'huntSequence',
  'lastHuntEventSequence',
  'selectedEncounterId',
  'cycleTargetEncounterId',
  'cycleTargetMobId',
  'targetEncounterId',
  'targetMobId',
  'targetFoundCount',
  'currentTargetFoundCount',
] as const;

const HUNT_BATCH_KEYS = [
  'id',
  'characterId',
  'mapId',
  'sessionId',
  'status',
  'startedAt',
  'stoppedAt',
  'consumedAt',
  'cancelledAt',
  'lastProcessedAt',
  'cycleStartedAt',
  'cycleEndsAt',
  'cycleDurationMs',
  'cycleVersion',
  'appliedPetBonus',
  'huntingLevelAtStart',
  'huntingXpGained',
  'foundEnemiesCount',
  'availableEnemiesCount',
  'remainingEnemiesCount',
  'hasPreservedTrackedEnemies',
  'preservedTrackedEnemiesCount',
  'autoCombatRecovery',
  'maxTrackedEnemies',
  'remainingCapacity',
  'isLimitReached',
  'bonusEnemiesFound',
  'selectedEncounterId',
  'selectedEncounterMobId',
  'cycleTargetEncounterId',
  'cycleTargetMobId',
  'huntSequence',
] as const;

const TRACKED_MONSTER_KEYS = [
  'mobId',
  'mobName',
  'mobLevel',
  'mobTier',
  'encounterId',
  'foundCount',
  'remainingCount',
  'weightSnapshot',
  'firstFoundAt',
  'lastFoundAt',
] as const;

const ENCOUNTER_KEYS = [
  'id',
  'mobId',
  'subMapId',
  'weight',
  'isActive',
  'foundCount',
  'huntFoundCount',
] as const;

const LOCATION_KEYS = [
  'id',
  'name',
  'tier',
  'minLevel',
  'maxLevel',
  'description',
] as const;

function asRecord(value: unknown): PayloadRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as PayloadRecord;
}

function pick(
  source: PayloadRecord | null,
  keys: readonly string[],
): PayloadRecord | null {
  if (!source) return null;

  const result: PayloadRecord = {};

  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
}

function compactBattleProgress(value: unknown) {
  return pick(asRecord(value), BATTLE_PROGRESS_KEYS);
}

function compactMob(value: unknown) {
  const source = asRecord(value);
  const compact = pick(source, MOB_KEYS);

  if (!source || !compact) return null;

  const battleProgress = compactBattleProgress(source.battleProgress);

  if (battleProgress) {
    compact.battleProgress = battleProgress;
  }

  return compact;
}

function compactEncounter(value: unknown) {
  const source = asRecord(value);
  const compact = pick(source, ENCOUNTER_KEYS);

  if (!source || !compact) return null;

  const mob = compactMob(source.mob);

  if (mob) compact.mob = mob;

  return compact;
}

function compactTrackedMonsters(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => pick(asRecord(entry), TRACKED_MONSTER_KEYS))
    .filter((entry): entry is PayloadRecord => Boolean(entry));
}

function compactRewards(value: unknown) {
  const source = asRecord(value);

  if (!source) return null;

  const loots = Array.isArray(source.loots)
    ? source.loots.map((loot) => {
        const lootSource = asRecord(loot);
        const compactLoot = pick(lootSource, [
          'itemId',
          'itemName',
          'quantity',
          'rarity',
          'slot',
          'tier',
          'icon',
          'iconUrl',
          'iconPath',
          'imageUrl',
        ]);

        if (!lootSource || !compactLoot) return null;

        const compactItem = pick(asRecord(lootSource.item), [
          'id',
          'name',
          'slug',
          'assetKey',
          'tier',
          'rarity',
          'slot',
          'family',
          'materialOrigin',
          'icon',
          'iconUrl',
          'iconPath',
          'imageUrl',
        ]);

        if (compactItem) compactLoot.item = compactItem;

        return compactLoot;
      })
    : [];

  return {
    loots: loots.filter((loot): loot is PayloadRecord => Boolean(loot)),
  };
}

function compactSessionSummary(value: unknown) {
  const source = asRecord(value);

  if (!source) return null;

  return pick(source, [
    'status',
    'statusText',
    'duration',
    'combat',
    'progression',
    'loot',
    'potions',
    'hp',
  ]);
}

/**
 * Projecao pequena para o transporte em tempo real. O status REST completo
 * continua sendo a fonte de recuperacao para detalhes, inventario e relatorios.
 */
export function buildAutoCombatRealtimeStatusPayload(payload: unknown) {
  const source = asRecord(payload);

  if (!source) return payload;

  const result = pick(source, STATUS_KEYS) ?? {};
  const sessionSource = asRecord(source.session);
  const session = pick(sessionSource, SESSION_KEYS);
  const character = pick(asRecord(source.character), CHARACTER_KEYS);
  const currentMob = compactMob(source.currentMob);
  const battleProgress = compactBattleProgress(
    source.battleProgress ?? sessionSource?.battleProgress,
  );
  const battleSelectionSource = asRecord(
    source.battleSelection ?? sessionSource?.battleSelection,
  );
  const battleSelection = pick(battleSelectionSource, [
    'mobId',
    'encounterId',
    'total',
    'remaining',
    'defeated',
  ]);
  const selectedEncounter = compactEncounter(source.selectedEncounter);
  const trackedMonsters = compactTrackedMonsters(source.trackedMonsters);
  const huntingSource = asRecord(source.hunting);
  const hunting = pick(huntingSource, HUNTING_KEYS);
  const huntingSkill = asRecord(source.huntingSkill);
  const huntBatch = pick(asRecord(source.huntBatch), HUNT_BATCH_KEYS);
  const subMapSource = asRecord(source.subMap);
  const subMap = pick(subMapSource, LOCATION_KEYS);
  const map = pick(asRecord(source.map), LOCATION_KEYS);
  const rewards = compactRewards(source.rewards);
  const sessionSummary = compactSessionSummary(source.sessionSummary);

  if (battleSelectionSource && battleSelection) {
    const battleSelectionMob = compactMob(battleSelectionSource.mob);
    if (battleSelectionMob) battleSelection.mob = battleSelectionMob;
  }

  if (huntingSource && hunting) {
    if ('selectedMob' in huntingSource) {
      hunting.selectedMob = compactMob(huntingSource.selectedMob);
    }
    if ('targetMob' in huntingSource) {
      hunting.targetMob = compactMob(huntingSource.targetMob);
    }
    if ('currentTarget' in huntingSource) {
      hunting.currentTarget = compactEncounter(huntingSource.currentTarget);
    }
    if ('targetEncounter' in huntingSource) {
      hunting.targetEncounter = compactEncounter(huntingSource.targetEncounter);
    }
  }

  const huntBatchSource = asRecord(source.huntBatch);
  if (huntBatchSource && huntBatch && 'currentTarget' in huntBatchSource) {
    huntBatch.currentTarget = compactEncounter(huntBatchSource.currentTarget);
  }

  if (session) {
    if (battleProgress) session.battleProgress = battleProgress;
    if (battleSelection) session.battleSelection = battleSelection;
    result.session = session;
  }

  if (character) result.character = character;
  if ('currentMob' in source) result.currentMob = currentMob;
  if ('battleProgress' in source) result.battleProgress = battleProgress;
  if (battleSelection) result.battleSelection = battleSelection;
  if ('selectedEncounter' in source) {
    result.selectedEncounter = selectedEncounter;
  }
  if (Array.isArray(source.trackedMonsters)) {
    result.trackedMonsters = trackedMonsters;
  }
  if ('hunting' in source) result.hunting = hunting;
  if (huntingSkill) result.huntingSkill = huntingSkill;
  if ('huntBatch' in source) result.huntBatch = huntBatch;

  if (subMap) {
    const subMapMap = pick(asRecord(subMapSource?.map), LOCATION_KEYS);
    if (subMapMap) subMap.map = subMapMap;
    result.subMap = subMap;
  }

  if (map) result.map = map;
  if ('rewards' in source) result.rewards = rewards;
  if (sessionSummary) result.sessionSummary = sessionSummary;

  return result;
}

export function getSerializedPayloadBytes(payload: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch {
    return 0;
  }
}
