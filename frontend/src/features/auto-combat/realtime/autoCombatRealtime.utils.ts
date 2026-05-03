import type {
  AutoCombatLevelProgressViewModel,
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from '../types/auto-combat.types';
import type {
  AutoCombatRealtimeActor,
  AutoCombatRealtimeCharacterState,
  AutoCombatRealtimeLocationState,
  AutoCombatRealtimeMobState,
  AutoCombatRealtimePotionState,
  AutoCombatRealtimeSessionState,
  AutoCombatRealtimeTarget,
  AutoCombatRealtimeTotalsState,
  AutoCombatRealtimeVisualState,
} from './autoCombatRealtime.types';

type LooseNumberRecord = Record<string, unknown>;

type ProgressSource = {
  level?: number | null;
  oldLevel?: number | null;
  newLevel?: number | null;

  xp?: number | null;
  totalXp?: number | null;
  currentXp?: number | null;
  gainedXp?: number | null;

  currentLevelXp?: number | null;
  xpToNextLevel?: number | null;
  nextLevelXp?: number | null;

  currentLevelStartXp?: number | null;
  nextLevelRequiredXp?: number | null;
  xpIntoCurrentLevel?: number | null;
  xpNeededForNextLevel?: number | null;

  progressPercent?: number | null;
  xpProgressPercent?: number | null;
  isAtLevelCap?: boolean | null;

  levelProgress?: AutoCombatLevelProgressViewModel | null;
};

type StatusSessionLike = NonNullable<
  | AutoCombatStatusResponse['session']
  | AutoCombatStatusResponse['activeSession']
  | AutoCombatStatusResponse['autoCombatSession']
  | AutoCombatStatusResponse['lastSession']
>;

type AutoCombatSessionLike = {
  id?: string | null;
  characterId?: string | null;
  subMapId?: string | null;
  status?: string | null;

  startedAt?: string | Date | null;
  endsAt?: string | Date | null;
  finishedAt?: string | Date | null;

  remainingSeconds?: number | null;
  durationSeconds?: number | null;
  roundDurationSeconds?: number | null;

  currentRound?: number | null;
  currentCombatIndex?: number | null;

  currentMobHp?: number | null;
  currentMobMaxHp?: number | null;
};

type RealtimeEventLoose = AutoCombatRealtimeEvent & {
  createdAt?: string | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;

  potionItemId?: string | null;
  potionItemName?: string | null;
  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;
  potionTriggerPercent?: number | null;
};

/**
 * Tempo em que cada evento visual fica “em cena”.
 *
 * Regra:
 * - O backend pode enviar vários eventos quase juntos.
 * - O frontend mostra 1 evento por vez.
 * - O spawn do monstro fica bem curto para não atrasar o primeiro turno.
 * - Hits continuam com tempo suficiente para o jogador perceber quem atacou,
 *   quanto dano causou e qual HP mudou.
 *
 * Ajuste atual:
 * - Spawn: 350ms, apenas para o jogador perceber que o mob nasceu.
 * - Eventos de ação: 950ms, ritmo ágil sem embolar os turnos.
 */
export const AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS = 950;
export const AUTO_COMBAT_REALTIME_SPAWN_EVENT_DELAY_MS = 350;

export const AUTO_COMBAT_REALTIME_EVENT_DELAY_MS = {
  MOB_SPAWNED: AUTO_COMBAT_REALTIME_SPAWN_EVENT_DELAY_MS,
  PLAYER_HIT: AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS,
  MOB_HIT: AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS,
  DODGE: AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS,
  POTION_USED: AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS,
  MOB_DEFEATED: AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS,
  PLAYER_DEFEATED: AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS,
  DEFAULT: AUTO_COMBAT_REALTIME_DEFAULT_EVENT_DELAY_MS,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toSafeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getFirstOptionalNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = getOptionalNumber(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

export function getHighestOptionalNumber(...values: unknown[]) {
  const numbers = values
    .map(getOptionalNumber)
    .filter((value): value is number => value !== undefined);

  if (numbers.length <= 0) {
    return undefined;
  }

  return Math.max(...numbers);
}

export function getOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

export function clampNumber(value: unknown, min: number, max: number) {
  const parsed = toSafeNumber(value, min);

  return Math.max(min, Math.min(parsed, max));
}

export function clampPercent(value: unknown) {
  return clampNumber(value, 0, 100);
}

export function calculatePercent(current?: number | null, max?: number | null) {
  const safeMax = toSafeNumber(max, 0);

  if (safeMax <= 0) {
    return 0;
  }

  const safeCurrent = clampNumber(current, 0, safeMax);

  return clampPercent((safeCurrent / safeMax) * 100);
}

export function normalizeRealtimeEventType(
  typeOrEvent?: string | AutoCombatRealtimeEvent | null,
) {
  if (typeof typeOrEvent === 'string') {
    return typeOrEvent.trim().toUpperCase();
  }

  return String(typeOrEvent?.type ?? '').trim().toUpperCase();
}

export function normalizeSessionStatus(status?: string | null) {
  return String(status ?? '').trim().toUpperCase();
}

export function isActiveSessionStatus(status?: string | null) {
  return normalizeSessionStatus(status) === 'ACTIVE';
}

export function isTerminalSessionStatus(status?: string | null) {
  const normalizedStatus = normalizeSessionStatus(status);

  return (
    normalizedStatus === 'FINISHED' ||
    normalizedStatus === 'STOPPED' ||
    normalizedStatus === 'DEFEATED' ||
    normalizedStatus === 'FAILED' ||
    normalizedStatus === 'CANCELLED'
  );
}

export function isMobDefeatedEvent(event?: AutoCombatRealtimeEvent | null) {
  return normalizeRealtimeEventType(event) === 'MOB_DEFEATED';
}

export function isPlayerDefeatedEvent(event?: AutoCombatRealtimeEvent | null) {
  return normalizeRealtimeEventType(event) === 'PLAYER_DEFEATED';
}

export function isMobSpawnedEvent(event?: AutoCombatRealtimeEvent | null) {
  return normalizeRealtimeEventType(event) === 'MOB_SPAWNED';
}

export function isPotionUsedEvent(event?: AutoCombatRealtimeEvent | null) {
  return normalizeRealtimeEventType(event) === 'POTION_USED';
}

export function isDamageEvent(event?: AutoCombatRealtimeEvent | null) {
  const type = normalizeRealtimeEventType(event);

  return type === 'PLAYER_HIT' || type === 'MOB_HIT';
}

export function getRealtimeEventDelay(event?: AutoCombatRealtimeEvent | null) {
  const eventType = normalizeRealtimeEventType(event);

  if (eventType === 'MOB_SPAWNED') {
    return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.MOB_SPAWNED;
  }

  if (eventType === 'PLAYER_HIT') {
    return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.PLAYER_HIT;
  }

  if (eventType === 'MOB_HIT') {
    return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.MOB_HIT;
  }

  if (eventType === 'DODGE') {
    return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.DODGE;
  }

  if (eventType === 'POTION_USED') {
    return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.POTION_USED;
  }

  if (eventType === 'MOB_DEFEATED') {
    return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.MOB_DEFEATED;
  }

  if (eventType === 'PLAYER_DEFEATED') {
    return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.PLAYER_DEFEATED;
  }

  return AUTO_COMBAT_REALTIME_EVENT_DELAY_MS.DEFAULT;
}

export function getStatusSession(
  status: AutoCombatStatusResponse | null | undefined,
) {
  if (!status) return null;

  return (
    status.session ??
    status.activeSession ??
    status.autoCombatSession ??
    status.lastSession ??
    null
  );
}

export function getStatusCharacterId(
  status: AutoCombatStatusResponse | null | undefined,
) {
  if (!status) return null;

  return status.character?.id ?? getStatusSession(status)?.characterId ?? null;
}

export function isStatusForCharacter(
  characterId: string | null | undefined,
  status: AutoCombatStatusResponse | null | undefined,
) {
  if (!characterId) return false;

  const statusCharacterId = getStatusCharacterId(status);

  return !statusCharacterId || statusCharacterId === characterId;
}

export function isEventForCharacter(
  characterId: string | null | undefined,
  event: AutoCombatRealtimeEvent | null | undefined,
) {
  if (!characterId || !event) return false;

  return !event.characterId || event.characterId === characterId;
}

export function isStatusActive(status: AutoCombatStatusResponse | null) {
  const session = getStatusSession(status);
  const sessionStatus = normalizeSessionStatus(session?.status);

  if (isTerminalSessionStatus(sessionStatus)) {
    return false;
  }

  if (isActiveSessionStatus(sessionStatus)) {
    return true;
  }

  return Boolean(status?.active) || Boolean(status?.hasActiveAutoCombat);
}

export function isSameSessionId(
  firstSessionId?: string | null,
  secondSessionId?: string | null,
) {
  if (!firstSessionId || !secondSessionId) {
    return true;
  }

  return firstSessionId === secondSessionId;
}

export function shouldIgnoreFallbackForNewSession(
  incomingSessionId?: string | null,
  fallbackSessionId?: string | null,
) {
  return Boolean(
    incomingSessionId &&
      fallbackSessionId &&
      incomingSessionId !== fallbackSessionId,
  );
}

export function getRealtimeEventKey(payload: AutoCombatRealtimeEvent) {
  const event = payload as RealtimeEventLoose;

  return [
    event.sessionId ?? 'no-session',
    event.characterId ?? 'no-character',
    event.type ?? 'no-type',
    event.createdAt ?? 'no-created-at',

    event.mobId ?? 'no-mob',
    event.mobName ?? 'no-mob-name',
    event.round ?? 'no-round',
    event.combatIndex ?? 'no-combat',

    event.message ?? 'no-message',
    event.damage ?? 'no-damage',
    event.healedAmount ?? 'no-heal',

    event.characterCurrentHp ?? 'no-character-hp',
    event.characterMaxHp ?? 'no-character-max-hp',
    event.mobCurrentHp ?? 'no-mob-hp',
    event.mobMaxHp ?? 'no-mob-max-hp',

    event.characterXp ?? event.totalXp ?? 'no-xp',
    event.characterLevel ?? 'no-level',
    event.xpGained ?? 'no-xp-gained',

    event.totalCombats ?? 'no-total-combats',
    event.totalRounds ?? 'no-total-rounds',
    event.totalKills ?? 'no-kills',
    event.totalXpGained ?? 'no-total-xp',
    event.totalLoot ?? 'no-total-loot',
    event.potionsUsed ?? 'no-potions',

    event.potionItemId ?? 'no-potion-item',
    event.potionQuantityBefore ?? 'no-potion-before',
    event.potionQuantityAfter ?? 'no-potion-after',
    event.potionQuantityRemaining ?? 'no-potion-remaining',
    event.potionUsedQuantity ?? 'no-potion-used-quantity',

    event.actor ?? 'no-actor',
    event.target ?? 'no-target',
  ].join('|');
}

export function getMobSpawnFingerprint(payload: AutoCombatRealtimeEvent) {
  if (!isMobSpawnedEvent(payload)) {
    return '';
  }

  /**
   * Regra robusta para evitar spawn duplicado no log:
   *
   * Para uma mesma sessão/personagem/combate, só deve existir um MOB_SPAWNED
   * visual, mesmo que:
   * - o backend emita o evento;
   * - o status seja reidratado;
   * - o provider crie um evento inicial de feedback visual.
   */
  if (payload.combatIndex !== null && payload.combatIndex !== undefined) {
    return [
      payload.sessionId ?? 'no-session',
      payload.characterId ?? 'no-character',
      payload.combatIndex,
      'mob-spawned',
    ].join('|');
  }

  return [
    payload.sessionId ?? 'no-session',
    payload.characterId ?? 'no-character',
    payload.mobId ?? 'no-mob',
    payload.mobName ?? 'no-mob-name',
    'mob-spawned',
  ].join('|');
}

export function getPotionUsedFingerprint(payload: AutoCombatRealtimeEvent) {
  if (!isPotionUsedEvent(payload)) {
    return '';
  }

  const event = payload as RealtimeEventLoose;

  return [
    event.sessionId ?? 'no-session',
    event.characterId ?? 'no-character',
    event.potionItemId ?? 'no-potion-item',
    event.potionQuantityBefore ?? 'no-before',
    event.potionQuantityAfter ?? 'no-after',
    event.potionQuantityRemaining ?? 'no-remaining',
    event.potionUsedQuantity ?? 'no-used-quantity',
    event.characterCurrentHp ?? 'no-character-hp',
    event.characterMaxHp ?? 'no-character-max-hp',
    event.round ?? 'no-round',
    event.combatIndex ?? 'no-combat',
  ].join('|');
}

export function getGenericRealtimeFingerprint(payload: AutoCombatRealtimeEvent) {
  const event = payload as RealtimeEventLoose;

  return [
    event.sessionId ?? 'no-session',
    event.characterId ?? 'no-character',
    event.type ?? 'no-type',
    event.mobId ?? 'no-mob',
    event.round ?? 'no-round',
    event.combatIndex ?? 'no-combat',
    event.damage ?? 'no-damage',
    event.healedAmount ?? 'no-heal',
    event.characterCurrentHp ?? 'no-character-hp',
    event.mobCurrentHp ?? 'no-mob-hp',
    event.characterXp ?? event.totalXp ?? 'no-xp',
    event.totalKills ?? 'no-kills',
    event.potionsUsed ?? 'no-potions',
    event.potionItemId ?? 'no-potion-item',
    event.potionQuantityBefore ?? 'no-potion-before',
    event.potionQuantityAfter ?? 'no-potion-after',
    event.potionQuantityRemaining ?? 'no-potion-remaining',
  ].join('|');
}

export function isSameRealtimeEvent(
  first: AutoCombatRealtimeEvent,
  second: AutoCombatRealtimeEvent,
) {
  const firstKey = getRealtimeEventKey(first);
  const secondKey = getRealtimeEventKey(second);

  if (firstKey === secondKey) {
    return true;
  }

  const firstSpawnFingerprint = getMobSpawnFingerprint(first);
  const secondSpawnFingerprint = getMobSpawnFingerprint(second);

  if (
    firstSpawnFingerprint &&
    secondSpawnFingerprint &&
    firstSpawnFingerprint === secondSpawnFingerprint
  ) {
    return true;
  }

  const firstPotionFingerprint = getPotionUsedFingerprint(first);
  const secondPotionFingerprint = getPotionUsedFingerprint(second);

  if (
    firstPotionFingerprint &&
    secondPotionFingerprint &&
    firstPotionFingerprint === secondPotionFingerprint
  ) {
    return true;
  }

  const firstGenericFingerprint = getGenericRealtimeFingerprint(first);
  const secondGenericFingerprint = getGenericRealtimeFingerprint(second);

  return Boolean(
    firstGenericFingerprint &&
      secondGenericFingerprint &&
      firstGenericFingerprint === secondGenericFingerprint,
  );
}

export function resolveRealtimeActor(
  event: AutoCombatRealtimeEvent,
  current?: AutoCombatRealtimeVisualState | null,
): AutoCombatRealtimeActor | undefined {
  const eventType = normalizeRealtimeEventType(event);

  if (event.actor) {
    return event.actor;
  }

  if (
    eventType === 'PLAYER_HIT' ||
    eventType === 'MOB_DEFEATED' ||
    eventType === 'POTION_USED'
  ) {
    return 'PLAYER';
  }

  if (eventType === 'MOB_HIT' || eventType === 'PLAYER_DEFEATED') {
    return 'MOB';
  }

  if (eventType === 'MOB_SPAWNED') {
    return 'SYSTEM';
  }

  return current?.actor ?? undefined;
}

export function resolveRealtimeTarget(
  event: AutoCombatRealtimeEvent,
  current?: AutoCombatRealtimeVisualState | null,
): AutoCombatRealtimeTarget | undefined {
  const eventType = normalizeRealtimeEventType(event);

  if (event.target) {
    return event.target;
  }

  if (
    eventType === 'PLAYER_HIT' ||
    eventType === 'MOB_DEFEATED' ||
    eventType === 'MOB_SPAWNED'
  ) {
    return 'MOB';
  }

  if (
    eventType === 'MOB_HIT' ||
    eventType === 'PLAYER_DEFEATED' ||
    eventType === 'POTION_USED'
  ) {
    return 'PLAYER';
  }

  return current?.target ?? undefined;
}

export function buildCharacterStateFromProgressSource(
  source: ProgressSource | null | undefined,
  fallback?: AutoCombatRealtimeCharacterState | null,
): AutoCombatRealtimeCharacterState | null {
  if (!source && !fallback) return null;

  const levelProgress = source?.levelProgress ?? null;

  const totalXp =
    getOptionalNumber(source?.totalXp) ??
    getOptionalNumber(levelProgress?.totalXp) ??
    getOptionalNumber(source?.xp) ??
    getOptionalNumber(levelProgress?.xp) ??
    fallback?.totalXp ??
    fallback?.xp;

  const level =
    getOptionalNumber(source?.level) ??
    getOptionalNumber(levelProgress?.newLevel) ??
    getOptionalNumber(levelProgress?.level) ??
    getOptionalNumber(levelProgress?.oldLevel) ??
    fallback?.level;

  const currentLevelXp =
    getOptionalNumber(source?.currentLevelXp) ??
    getOptionalNumber(source?.xpIntoCurrentLevel) ??
    getOptionalNumber(levelProgress?.currentLevelXp) ??
    getOptionalNumber(levelProgress?.xpIntoCurrentLevel) ??
    fallback?.currentLevelXp;

  const xpToNextLevel =
    getOptionalNumber(source?.xpToNextLevel) ??
    getOptionalNumber(source?.nextLevelXp) ??
    getOptionalNumber(levelProgress?.xpToNextLevel) ??
    getOptionalNumber(levelProgress?.nextLevelXp) ??
    fallback?.xpToNextLevel;

  const nextLevelXp =
    getOptionalNumber(source?.nextLevelXp) ??
    getOptionalNumber(source?.xpToNextLevel) ??
    getOptionalNumber(levelProgress?.nextLevelXp) ??
    getOptionalNumber(levelProgress?.xpToNextLevel) ??
    fallback?.nextLevelXp;

  const currentHp = getOptionalNumber(
    (source as LooseNumberRecord | null | undefined)?.currentHp,
  );

  const maxHp = getOptionalNumber(
    (source as LooseNumberRecord | null | undefined)?.maxHp,
  );

  const nextCurrentHp =
    currentHp !== undefined
      ? Math.max(0, Math.floor(currentHp))
      : fallback?.currentHp;

  const nextMaxHp =
    maxHp !== undefined ? Math.max(1, Math.floor(maxHp)) : fallback?.maxHp;

  const nextHpPercent =
    nextCurrentHp !== undefined && nextMaxHp !== undefined
      ? calculatePercent(nextCurrentHp, nextMaxHp)
      : fallback?.hpPercent;

  if (
    level === undefined &&
    totalXp === undefined &&
    nextCurrentHp === undefined &&
    nextMaxHp === undefined &&
    !fallback
  ) {
    return null;
  }

  return {
    ...fallback,

    level: level !== undefined ? Math.max(1, Math.floor(level)) : fallback?.level,

    xp: totalXp !== undefined ? Math.max(0, Math.floor(totalXp)) : fallback?.xp,

    totalXp:
      totalXp !== undefined
        ? Math.max(0, Math.floor(totalXp))
        : fallback?.totalXp,

    currentHp: nextCurrentHp,
    maxHp: nextMaxHp,
    hpPercent: nextHpPercent,

    currentLevelXp:
      currentLevelXp !== undefined
        ? Math.max(0, Math.floor(currentLevelXp))
        : fallback?.currentLevelXp,

    xpToNextLevel:
      xpToNextLevel !== undefined
        ? Math.max(1, Math.floor(xpToNextLevel))
        : fallback?.xpToNextLevel,

    nextLevelXp:
      nextLevelXp !== undefined
        ? Math.max(1, Math.floor(nextLevelXp))
        : fallback?.nextLevelXp,

    xpProgressPercent:
      getOptionalNumber(source?.xpProgressPercent) ??
      getOptionalNumber(levelProgress?.xpProgressPercent) ??
      getOptionalNumber(levelProgress?.progressPercent) ??
      fallback?.xpProgressPercent,

    xpIntoCurrentLevel:
      getOptionalNumber(source?.xpIntoCurrentLevel) ??
      getOptionalNumber(source?.currentLevelXp) ??
      getOptionalNumber(levelProgress?.xpIntoCurrentLevel) ??
      getOptionalNumber(levelProgress?.currentLevelXp) ??
      fallback?.xpIntoCurrentLevel,

    xpNeededForNextLevel:
      getOptionalNumber(source?.xpNeededForNextLevel) ??
      getOptionalNumber(levelProgress?.xpNeededForNextLevel) ??
      fallback?.xpNeededForNextLevel,

    currentLevelStartXp:
      getOptionalNumber(source?.currentLevelStartXp) ??
      getOptionalNumber(levelProgress?.currentLevelStartXp) ??
      fallback?.currentLevelStartXp,

    nextLevelRequiredXp:
      getOptionalNumber(source?.nextLevelRequiredXp) ??
      getOptionalNumber(levelProgress?.nextLevelRequiredXp) ??
      fallback?.nextLevelRequiredXp,

    isAtLevelCap:
      getOptionalBoolean(source?.isAtLevelCap) ??
      getOptionalBoolean(levelProgress?.isAtLevelCap) ??
      fallback?.isAtLevelCap,

    xpGained:
      getOptionalNumber(source?.levelProgress?.gainedXp) ??
      getOptionalNumber(source?.levelProgress?.currentXp) ??
      fallback?.xpGained,

    leveledUp:
      getOptionalBoolean(source?.levelProgress?.leveledUp) ??
      fallback?.leveledUp,

    levelsGained:
      getOptionalNumber(source?.levelProgress?.levelsGained) ??
      fallback?.levelsGained,

    updatedAt: Date.now(),
  };
}

export function buildCharacterStateFromStatus(
  status: AutoCombatStatusResponse | null,
  fallback?: AutoCombatRealtimeCharacterState | null,
): AutoCombatRealtimeCharacterState | null {
  const statusCharacter = status?.character;

  if (!statusCharacter) return fallback ?? null;

  return buildCharacterStateFromProgressSource(
    statusCharacter as ProgressSource,
    {
      ...fallback,
      id: statusCharacter.id ?? fallback?.id,
      name: statusCharacter.name ?? fallback?.name,
      currentHp: statusCharacter.currentHp ?? fallback?.currentHp,
      maxHp: statusCharacter.maxHp ?? fallback?.maxHp,
    },
  );
}

export function buildCharacterStateFromRealtimeEvent(
  event: AutoCombatRealtimeEvent,
  fallback?: AutoCombatRealtimeCharacterState | null,
): AutoCombatRealtimeCharacterState | null {
  const levelProgress = event.levelProgress ?? null;
  const xpGained = getOptionalNumber(event.xpGained ?? levelProgress?.gainedXp);

  const explicitTotalXp =
    getOptionalNumber(event.characterXp) ??
    getOptionalNumber(event.totalXp) ??
    getOptionalNumber(levelProgress?.totalXp) ??
    getOptionalNumber(levelProgress?.xp);

  const fallbackTotalXp = fallback?.totalXp ?? fallback?.xp;

  const nextTotalXp =
    explicitTotalXp ??
    (isMobDefeatedEvent(event) &&
    fallbackTotalXp !== undefined &&
    xpGained !== undefined
      ? fallbackTotalXp + xpGained
      : fallbackTotalXp);

  const nextLevel =
    getOptionalNumber(event.characterLevel) ??
    getOptionalNumber(levelProgress?.newLevel) ??
    getOptionalNumber(levelProgress?.level) ??
    getOptionalNumber(levelProgress?.oldLevel) ??
    fallback?.level;

  const nextMaxHp = getOptionalNumber(event.characterMaxHp) ?? fallback?.maxHp;

  const nextCurrentHp =
    isPlayerDefeatedEvent(event) && event.characterCurrentHp === undefined
      ? 0
      : getOptionalNumber(event.characterCurrentHp) ?? fallback?.currentHp;

  const hpPercent =
    nextCurrentHp !== undefined && nextMaxHp !== undefined
      ? calculatePercent(nextCurrentHp, nextMaxHp)
      : getOptionalNumber(event.characterHpPercent) ?? fallback?.hpPercent;

  return {
    ...fallback,

    level:
      nextLevel !== undefined ? Math.max(1, Math.floor(nextLevel)) : fallback?.level,

    xp:
      nextTotalXp !== undefined
        ? Math.max(0, Math.floor(nextTotalXp))
        : fallback?.xp,

    totalXp:
      nextTotalXp !== undefined
        ? Math.max(0, Math.floor(nextTotalXp))
        : fallback?.totalXp,

    currentHp:
      nextCurrentHp !== undefined
        ? Math.max(0, Math.floor(nextCurrentHp))
        : fallback?.currentHp,

    maxHp:
      nextMaxHp !== undefined
        ? Math.max(1, Math.floor(nextMaxHp))
        : fallback?.maxHp,

    hpPercent,

    currentLevelXp:
      getOptionalNumber(event.currentLevelXp) ??
      getOptionalNumber(event.xpIntoCurrentLevel) ??
      getOptionalNumber(levelProgress?.currentLevelXp) ??
      getOptionalNumber(levelProgress?.xpIntoCurrentLevel) ??
      fallback?.currentLevelXp,

    xpToNextLevel:
      getOptionalNumber(event.xpToNextLevel) ??
      getOptionalNumber(event.nextLevelXp) ??
      getOptionalNumber(levelProgress?.xpToNextLevel) ??
      getOptionalNumber(levelProgress?.nextLevelXp) ??
      fallback?.xpToNextLevel,

    nextLevelXp:
      getOptionalNumber(event.nextLevelXp) ??
      getOptionalNumber(event.xpToNextLevel) ??
      getOptionalNumber(levelProgress?.nextLevelXp) ??
      getOptionalNumber(levelProgress?.xpToNextLevel) ??
      fallback?.nextLevelXp,

    xpProgressPercent:
      getOptionalNumber(event.xpProgressPercent) ??
      getOptionalNumber(levelProgress?.xpProgressPercent) ??
      getOptionalNumber(levelProgress?.progressPercent) ??
      fallback?.xpProgressPercent,

    xpIntoCurrentLevel:
      getOptionalNumber(event.xpIntoCurrentLevel) ??
      getOptionalNumber(event.currentLevelXp) ??
      getOptionalNumber(levelProgress?.xpIntoCurrentLevel) ??
      getOptionalNumber(levelProgress?.currentLevelXp) ??
      fallback?.xpIntoCurrentLevel,

    xpNeededForNextLevel:
      getOptionalNumber(event.xpNeededForNextLevel) ??
      getOptionalNumber(levelProgress?.xpNeededForNextLevel) ??
      fallback?.xpNeededForNextLevel,

    currentLevelStartXp:
      getOptionalNumber(event.currentLevelStartXp) ??
      getOptionalNumber(levelProgress?.currentLevelStartXp) ??
      fallback?.currentLevelStartXp,

    nextLevelRequiredXp:
      getOptionalNumber(event.nextLevelRequiredXp) ??
      getOptionalNumber(levelProgress?.nextLevelRequiredXp) ??
      fallback?.nextLevelRequiredXp,

    isAtLevelCap:
      getOptionalBoolean(event.isAtLevelCap) ??
      getOptionalBoolean(levelProgress?.isAtLevelCap) ??
      fallback?.isAtLevelCap,

    xpGained,
    leveledUp:
      getOptionalBoolean(event.leveledUp) ??
      getOptionalBoolean(levelProgress?.leveledUp) ??
      fallback?.leveledUp,
    levelsGained:
      getOptionalNumber(event.levelsGained) ??
      getOptionalNumber(levelProgress?.levelsGained) ??
      fallback?.levelsGained,

    updatedAt: Date.now(),
  };
}

export function buildSessionStateFromStatus(
  status: AutoCombatStatusResponse | null,
  fallback?: AutoCombatRealtimeSessionState | null,
): AutoCombatRealtimeSessionState | null {
  const session = getStatusSession(status) as StatusSessionLike | null;

  if (!session) return fallback ?? null;

  const incomingSessionId = session.id ?? null;
  const safeFallback = shouldIgnoreFallbackForNewSession(
    incomingSessionId,
    fallback?.id ?? null,
  )
    ? null
    : fallback;

  return {
    ...safeFallback,

    id: incomingSessionId ?? safeFallback?.id ?? null,
    characterId: session.characterId ?? safeFallback?.characterId ?? null,
    subMapId: session.subMapId ?? safeFallback?.subMapId ?? null,

    status: session.status ?? safeFallback?.status ?? null,

    startedAt: session.startedAt ?? safeFallback?.startedAt ?? null,
    endsAt: session.endsAt ?? safeFallback?.endsAt ?? null,
    finishedAt: session.finishedAt ?? safeFallback?.finishedAt ?? null,

    remainingSeconds:
      session.remainingSeconds ??
      status?.sessionSummary?.duration?.remainingSeconds ??
      safeFallback?.remainingSeconds ??
      null,

    durationSeconds:
      session.durationSeconds ??
      status?.sessionSummary?.duration?.plannedSeconds ??
      safeFallback?.durationSeconds ??
      null,

    roundDurationSeconds:
      session.roundDurationSeconds ?? safeFallback?.roundDurationSeconds ?? null,

    currentRound: session.currentRound ?? safeFallback?.currentRound ?? null,

    currentCombatIndex:
      session.currentCombatIndex ?? safeFallback?.currentCombatIndex ?? null,

    updatedAt: Date.now(),
  };
}

export function buildLocationStateFromStatus(
  status: AutoCombatStatusResponse | null,
  fallback?: AutoCombatRealtimeLocationState | null,
): AutoCombatRealtimeLocationState | null {
  const subMap = status?.subMap;

  if (!subMap) return fallback ?? null;

  return {
    ...fallback,

    subMapId: subMap.id ?? fallback?.subMapId ?? null,
    subMapName: subMap.name ?? fallback?.subMapName ?? null,

    mapId: subMap.map?.id ?? fallback?.mapId ?? null,
    mapName: subMap.map?.name ?? subMap.mapName ?? fallback?.mapName ?? null,

    tier: subMap.tier ?? subMap.map?.tier ?? fallback?.tier ?? null,
    minLevel: subMap.minLevel ?? fallback?.minLevel ?? null,
    maxLevel: subMap.maxLevel ?? fallback?.maxLevel ?? null,
  };
}

export function buildMobStateFromStatus(
  status: AutoCombatStatusResponse | null,
  fallback?: AutoCombatRealtimeMobState | null,
): AutoCombatRealtimeMobState | null {
  const currentMob = status?.currentMob;
  const session = getStatusSession(status);
  const incomingSessionIsTerminal = isTerminalSessionStatus(session?.status);

  if (incomingSessionIsTerminal && !currentMob) {
    return null;
  }

  if (!currentMob) return fallback ?? null;

  const maxHp =
    getOptionalNumber(currentMob.maxHp) ??
    getOptionalNumber(currentMob.hp) ??
    fallback?.maxHp;

  const currentHp =
    getOptionalNumber(currentMob.currentHp) ??
    fallback?.currentHp ??
    maxHp;

  return {
    ...fallback,

    id: currentMob.id ?? fallback?.id ?? null,
    name: currentMob.name ?? fallback?.name ?? null,

    currentHp:
      currentHp !== undefined && maxHp !== undefined
        ? clampNumber(currentHp, 0, Math.max(0, maxHp))
        : currentHp,

    maxHp:
      maxHp !== undefined ? Math.max(0, Math.floor(maxHp)) : fallback?.maxHp,

    hpPercent:
      currentMob.hpPercent ??
      (currentHp !== undefined && maxHp !== undefined
        ? calculatePercent(currentHp, maxHp)
        : fallback?.hpPercent),

    level: currentMob.level ?? fallback?.level ?? null,
    tier: currentMob.tier ?? fallback?.tier ?? null,

    updatedAt: Date.now(),
  };
}

export function buildMobStateFromRealtimeEvent(
  event: AutoCombatRealtimeEvent,
  fallback?: AutoCombatRealtimeMobState | null,
): AutoCombatRealtimeMobState | null {
  const maxHp =
    getOptionalNumber(event.mobMaxHp) ??
    fallback?.maxHp ??
    getOptionalNumber(event.mobCurrentHp);

  const receivedCurrentHp =
    getOptionalNumber(event.mobCurrentHp) ?? fallback?.currentHp ?? maxHp;

  const currentHp = isMobDefeatedEvent(event)
    ? 0
    : receivedCurrentHp !== undefined && maxHp !== undefined
      ? clampNumber(receivedCurrentHp, 0, Math.max(0, maxHp))
      : receivedCurrentHp;

  return {
    ...fallback,

    id: event.mobId ?? fallback?.id ?? null,
    name: event.mobName ?? fallback?.name ?? null,

    currentHp,
    maxHp: maxHp !== undefined ? Math.max(0, Math.floor(maxHp)) : fallback?.maxHp,

    hpPercent:
      event.mobHpPercent ??
      (currentHp !== undefined && maxHp !== undefined
        ? calculatePercent(currentHp, maxHp)
        : fallback?.hpPercent),

    updatedAt: Date.now(),
  };
}

/**
 * Fonte canônica dos totais da sessão.
 *
 * Regra robusta:
 * - Status/backend vence para totais persistidos.
 * - Não usa "maior valor" contra fallback quando o status oficial veio do backend.
 * - Ao trocar sessionId, ignora completamente o fallback antigo.
 * - Eventos realtime continuam úteis para animação/HP/log, não como fonte principal dos totais.
 * - event.round NÃO é total de rodadas. event.round é a rodada atual do combate atual.
 */
export function buildCanonicalSessionTotalsFromStatus(
  status: AutoCombatStatusResponse | null,
): AutoCombatRealtimeTotalsState | null {
  const session = getStatusSession(status);

  if (!status && !session) {
    return null;
  }

  const sessionId = session?.id ?? null;

  const rewardsKillsTotal = status?.rewards?.mobs?.reduce((total, mob) => {
    return total + toSafeNumber(mob.kills, 0);
  }, 0);

  const rewardsLootTotal = status?.rewards?.loots?.reduce((total, loot) => {
    return total + toSafeNumber(loot.quantity, 0);
  }, 0);

  const totalKills =
    getFirstOptionalNumber(
      session?.totalCombatsResolved,
      status?.sessionSummary?.mobs?.totalKills,
      rewardsKillsTotal,
      session?.totalKills,
    ) ?? 0;

  const totalCombats =
    getFirstOptionalNumber(
      session?.totalCombatsResolved,
      status?.sessionSummary?.combat?.totalCombats,
      session?.totalCombats,
      totalKills,
    ) ?? 0;

  const totalRounds =
    getFirstOptionalNumber(
      session?.totalRoundsResolved,
      status?.sessionSummary?.combat?.totalRounds,
      session?.totalRounds,
    ) ?? 0;

  const totalXpGained =
    getFirstOptionalNumber(
      session?.totalXpGained,
      status?.sessionSummary?.progression?.totalXpGained,
    ) ?? 0;

  const totalLoot =
    getFirstOptionalNumber(
      status?.sessionSummary?.loot?.totalQuantity,
      rewardsLootTotal,
      session?.totalLoot,
    ) ?? 0;

  const potionsUsed =
    getFirstOptionalNumber(
      session?.totalPotionsUsed,
      session?.potionsUsed,
      status?.sessionSummary?.potions?.used,
      status?.processing?.potionsUsed,
    ) ?? 0;

  const currentCombatIndex =
    getFirstOptionalNumber(session?.currentCombatIndex, totalKills + 1, 1) ?? 1;

  return {
    sessionId,

    currentCombatIndex: Math.max(1, Math.floor(currentCombatIndex)),
    totalCombats: Math.max(0, Math.floor(totalCombats)),
    totalRounds: Math.max(0, Math.floor(totalRounds)),
    totalKills: Math.max(0, Math.floor(totalKills)),
    totalXpGained: Math.max(0, Math.floor(totalXpGained)),
    totalLoot: Math.max(0, Math.floor(totalLoot)),
    potionsUsed: Math.max(0, Math.floor(potionsUsed)),

    updatedAt: Date.now(),
  };
}

export function buildTotalsStateFromStatus(
  status: AutoCombatStatusResponse | null,
  fallback?: AutoCombatRealtimeTotalsState | null,
): AutoCombatRealtimeTotalsState | null {
  const canonicalTotals = buildCanonicalSessionTotalsFromStatus(status);

  if (!canonicalTotals) {
    return fallback ?? null;
  }

  return canonicalTotals;
}

export function buildTotalsStateFromRealtimeEvent(
  event: AutoCombatRealtimeEvent,
  fallback?: AutoCombatRealtimeTotalsState | null,
): AutoCombatRealtimeTotalsState | null {
  const looseEvent = event as RealtimeEventLoose;
  const eventType = normalizeRealtimeEventType(event);

  const incomingSessionId = event.sessionId ?? null;

  const safeFallback = shouldIgnoreFallbackForNewSession(
    incomingSessionId,
    fallback?.sessionId ?? null,
  )
    ? null
    : fallback;

  const currentKills = safeFallback?.totalKills ?? 0;
  const currentXpGained = safeFallback?.totalXpGained ?? 0;
  const currentPotionsUsed = safeFallback?.potionsUsed ?? 0;

  const eventXpGained = getOptionalNumber(event.xpGained);

  const totalKills =
    getOptionalNumber(looseEvent.totalKills) ??
    (eventType === 'MOB_DEFEATED' ? currentKills + 1 : safeFallback?.totalKills);

  const totalXpGained =
    getOptionalNumber(looseEvent.totalXpGained) ??
    (eventType === 'MOB_DEFEATED' && eventXpGained !== undefined
      ? currentXpGained + eventXpGained
      : safeFallback?.totalXpGained);

  const potionsUsed =
    eventType === 'POTION_USED'
      ? getHighestOptionalNumber(
          looseEvent.potionsUsed,
          currentPotionsUsed + 1,
          1,
        )
      : getOptionalNumber(looseEvent.potionsUsed) ?? safeFallback?.potionsUsed;

  const currentCombatIndex =
    getOptionalNumber(event.combatIndex) ??
    (eventType === 'MOB_DEFEATED' && totalKills !== undefined
      ? totalKills + 1
      : safeFallback?.currentCombatIndex);

  const totalRounds =
    getOptionalNumber(looseEvent.totalRounds) ?? safeFallback?.totalRounds;

  const totalCombats =
    getHighestOptionalNumber(
      looseEvent.totalCombats,
      eventType === 'MOB_DEFEATED' ? totalKills : undefined,
      safeFallback?.totalCombats,
      totalKills,
    ) ?? safeFallback?.totalCombats;

  return {
    ...safeFallback,

    sessionId: incomingSessionId ?? safeFallback?.sessionId ?? null,

    currentCombatIndex:
      currentCombatIndex !== undefined
        ? Math.max(1, Math.floor(currentCombatIndex))
        : safeFallback?.currentCombatIndex,

    totalCombats:
      totalCombats !== undefined ? Math.max(0, Math.floor(totalCombats)) : 0,

    totalRounds:
      totalRounds !== undefined
        ? Math.max(0, Math.floor(totalRounds))
        : safeFallback?.totalRounds ?? 0,

    totalKills:
      totalKills !== undefined ? Math.max(0, Math.floor(totalKills)) : 0,

    totalXpGained:
      totalXpGained !== undefined
        ? Math.max(0, Math.floor(totalXpGained))
        : safeFallback?.totalXpGained ?? 0,

    totalLoot:
      getHighestOptionalNumber(looseEvent.totalLoot, safeFallback?.totalLoot, 0) ??
      0,

    potionsUsed:
      potionsUsed !== undefined
        ? Math.max(0, Math.floor(potionsUsed))
        : safeFallback?.potionsUsed ?? 0,

    updatedAt: Date.now(),
  };
}

export function buildPotionStateFromRealtimeEvent(
  event: AutoCombatRealtimeEvent,
  fallback?: AutoCombatRealtimePotionState | null,
): AutoCombatRealtimePotionState | null {
  if (!isPotionUsedEvent(event)) return fallback ?? null;

  const looseEvent = event as RealtimeEventLoose;

  return {
    ...fallback,

    potionItemId: looseEvent.potionItemId ?? fallback?.potionItemId ?? null,
    potionItemName: looseEvent.potionItemName ?? fallback?.potionItemName ?? null,

    quantityBefore:
      getOptionalNumber(looseEvent.potionQuantityBefore) ??
      fallback?.quantityBefore ??
      null,

    quantityAfter:
      getOptionalNumber(looseEvent.potionQuantityAfter) ??
      getOptionalNumber(looseEvent.potionQuantityRemaining) ??
      fallback?.quantityAfter ??
      null,

    quantityRemaining:
      getOptionalNumber(looseEvent.potionQuantityRemaining) ??
      getOptionalNumber(looseEvent.potionQuantityAfter) ??
      fallback?.quantityRemaining ??
      null,

    usedQuantity:
      getOptionalNumber(looseEvent.potionUsedQuantity) ??
      fallback?.usedQuantity ??
      1,

    healedAmount:
      getOptionalNumber(looseEvent.healedAmount) ??
      fallback?.healedAmount ??
      null,

    triggerPercent:
      getOptionalNumber(looseEvent.potionTriggerPercent) ??
      fallback?.triggerPercent ??
      null,

    updatedAt: Date.now(),
  };
}

export function buildVisualStateFromRealtimeEvent(
  event: AutoCombatRealtimeEvent,
  fallback?: AutoCombatRealtimeVisualState | null,
): AutoCombatRealtimeVisualState {
  const eventType = normalizeRealtimeEventType(event);
  const isDamage = isDamageEvent(event);
  const damage = getOptionalNumber(event.damage);

  return {
    ...fallback,

    lastMessage: event.message ?? fallback?.lastMessage ?? null,
    lastDamage: isDamage ? damage ?? 0 : 0,
    lastEventType: eventType || fallback?.lastEventType || null,

    actor: resolveRealtimeActor(event, fallback) ?? fallback?.actor ?? null,
    target: resolveRealtimeTarget(event, fallback) ?? fallback?.target ?? null,

    isCritical: event.isCritical ?? false,
    isDodged: event.isDodged ?? eventType === 'DODGE',

    updatedAt: Date.now(),
  };
}

/**
 * Mantido para eventos realtime e fallback visual.
 * Não use esta função para sobrescrever totais oficiais vindos do status/backend.
 */
export function mergeTotalsKeepingHighest(
  current: AutoCombatRealtimeTotalsState | null,
  incoming: AutoCombatRealtimeTotalsState | null,
): AutoCombatRealtimeTotalsState | null {
  if (!incoming) return current;
  if (!current) return incoming;

  if (
    current.sessionId &&
    incoming.sessionId &&
    current.sessionId !== incoming.sessionId
  ) {
    return incoming;
  }

  return {
    sessionId: incoming.sessionId ?? current.sessionId ?? null,

    currentCombatIndex:
      getHighestOptionalNumber(
        current.currentCombatIndex,
        incoming.currentCombatIndex,
      ) ?? current.currentCombatIndex,

    totalCombats:
      getHighestOptionalNumber(current.totalCombats, incoming.totalCombats) ?? 0,

    totalRounds:
      getHighestOptionalNumber(current.totalRounds, incoming.totalRounds) ?? 0,

    totalKills:
      getHighestOptionalNumber(current.totalKills, incoming.totalKills) ?? 0,

    totalXpGained:
      getHighestOptionalNumber(
        current.totalXpGained,
        incoming.totalXpGained,
      ) ?? 0,

    totalLoot:
      getHighestOptionalNumber(current.totalLoot, incoming.totalLoot) ?? 0,

    potionsUsed:
      getHighestOptionalNumber(current.potionsUsed, incoming.potionsUsed) ?? 0,

    updatedAt: Date.now(),
  };
}

export function mergeCharacterKeepingHighestXp(
  current: AutoCombatRealtimeCharacterState | null,
  incoming: AutoCombatRealtimeCharacterState | null,
): AutoCombatRealtimeCharacterState | null {
  if (!incoming) return current;
  if (!current) return incoming;

  const currentXp = current.totalXp ?? current.xp;
  const incomingXp = incoming.totalXp ?? incoming.xp;

  if (
    currentXp !== undefined &&
    incomingXp !== undefined &&
    currentXp > incomingXp
  ) {
    return {
      ...incoming,
      ...current,
      updatedAt: Date.now(),
    };
  }

  return {
    ...current,
    ...incoming,

    id: incoming.id ?? current.id,
    name: incoming.name ?? current.name,

    level:
      getHighestOptionalNumber(current.level, incoming.level) ?? current.level,

    xp: incoming.xp ?? current.xp,
    totalXp: incoming.totalXp ?? incoming.xp ?? current.totalXp ?? current.xp,

    currentHp: incoming.currentHp ?? current.currentHp,
    maxHp: incoming.maxHp ?? current.maxHp,
    hpPercent: incoming.hpPercent ?? current.hpPercent,

    currentLevelXp: incoming.currentLevelXp ?? current.currentLevelXp,
    xpToNextLevel: incoming.xpToNextLevel ?? current.xpToNextLevel,
    nextLevelXp: incoming.nextLevelXp ?? current.nextLevelXp,
    xpProgressPercent: incoming.xpProgressPercent ?? current.xpProgressPercent,

    xpIntoCurrentLevel: incoming.xpIntoCurrentLevel ?? current.xpIntoCurrentLevel,
    xpNeededForNextLevel:
      incoming.xpNeededForNextLevel ?? current.xpNeededForNextLevel,
    currentLevelStartXp:
      incoming.currentLevelStartXp ?? current.currentLevelStartXp,
    nextLevelRequiredXp:
      incoming.nextLevelRequiredXp ?? current.nextLevelRequiredXp,
    isAtLevelCap: incoming.isAtLevelCap ?? current.isAtLevelCap,

    xpGained: incoming.xpGained ?? current.xpGained,
    leveledUp: incoming.leveledUp ?? current.leveledUp,
    levelsGained: incoming.levelsGained ?? current.levelsGained,

    updatedAt: Date.now(),
  };
}

export function limitArray<T>(items: T[], maxItems: number) {
  if (items.length <= maxItems) return items;

  return items.slice(items.length - maxItems);
}

export function buildMobSpawnedEventFromStatus(params: {
  status: AutoCombatStatusResponse;
  session?: AutoCombatSessionLike | null;
  fallbackCharacterCurrentHp?: number | null;
  fallbackCharacterMaxHp?: number | null;
}): AutoCombatRealtimeEvent | null {
  const { status, session } = params;

  const currentMob = status.currentMob;

  if (!currentMob) {
    return null;
  }

  const mobName = currentMob.name ?? 'Ameaça infectada';

  const mobMaxHp = Math.max(
    0,
    toSafeNumber(
      currentMob.maxHp ??
        currentMob.hp ??
        session?.currentMobMaxHp ??
        session?.currentMobHp,
      0,
    ),
  );

  const mobCurrentHp = clampNumber(
    currentMob.currentHp ?? session?.currentMobHp ?? mobMaxHp,
    0,
    mobMaxHp,
  );

  const characterMaxHp = Math.max(
    1,
    toSafeNumber(status.character?.maxHp ?? params.fallbackCharacterMaxHp, 1),
  );

  const characterCurrentHp = clampNumber(
    status.character?.currentHp ??
      params.fallbackCharacterCurrentHp ??
      characterMaxHp,
    0,
    characterMaxHp,
  );

  const combatIndex = session?.currentCombatIndex ?? 1;

  return {
    characterId: status.character?.id ?? session?.characterId ?? undefined,
    sessionId: session?.id ?? undefined,
    type: 'MOB_SPAWNED',

    mobId: currentMob.id ?? undefined,
    mobName,
    mobCurrentHp,
    mobMaxHp,
    mobHpPercent:
      mobMaxHp > 0 ? clampPercent((mobCurrentHp / mobMaxHp) * 100) : 0,

    characterCurrentHp,
    characterMaxHp,
    characterHpPercent:
      characterMaxHp > 0
        ? clampPercent((characterCurrentHp / characterMaxHp) * 100)
        : 0,

    actor: 'SYSTEM',
    target: 'MOB',
    round: session?.currentRound ?? 0,
    combatIndex,
    message: `${mobName} apareceu.`,

    /**
     * createdAt determinístico:
     * evita que o mesmo spawn vindo do status seja considerado evento diferente
     * a cada hidratação/reload.
     */
    createdAt: `status-spawn-${session?.id ?? 'no-session'}-${
      status.character?.id ?? session?.characterId ?? 'no-character'
    }-${combatIndex}-${currentMob.id ?? mobName}`,
  };
}