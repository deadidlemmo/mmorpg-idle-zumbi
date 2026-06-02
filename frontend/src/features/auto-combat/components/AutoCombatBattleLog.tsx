import { useEffect, useMemo, useRef } from 'react';
import type { AutoCombatRealtimeEvent } from '../types/auto-combat.types';

interface AutoCombatBattleLogProps {
  events: AutoCombatRealtimeEvent[];
  activeEvent?: AutoCombatRealtimeEvent | null;
  maxItems?: number;
  isActive?: boolean;
  title?: string;
  emptyMessage?: string;
  className?: string;
}

type BattleLogVisualType =
  | 'spawn'
  | 'player-hit'
  | 'mob-hit'
  | 'dodge'
  | 'potion'
  | 'mob-defeated'
  | 'player-defeated'
  | 'system';

type BattleLogActorRole = 'player' | 'mob' | 'system';

type BattleLogResultTone =
  | 'damage'
  | 'critical'
  | 'xp'
  | 'heal'
  | 'dodge'
  | 'danger'
  | 'info'
  | 'empty';

type AutoCombatRealtimeEventExtra = AutoCombatRealtimeEvent & {
  id?: string | null;
  eventId?: string | null;
  enemyInstanceId?: string | null;
  sequence?: number | string | null;

  characterId?: string | null;
  createdAt?: string | null;

  xpGained?: number | null;
  totalXp?: number | null;
  characterXp?: number | null;
  characterLevel?: number | null;

  totalCombats?: number | null;
  totalRounds?: number | null;
  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;
  leveledUp?: boolean | null;
  levelsGained?: number | null;

  healedAmount?: number | null;

  potionItemId?: string | null;
  potionItemName?: string | null;
  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;
};

type DecoratedBattleLogEvent = {
  event: AutoCombatRealtimeEvent;
  sourceIndex: number;
  isActiveEvent: boolean;
};

type NormalizedBattleLogItem = {
  key: string;
  type: BattleLogVisualType;
  role: BattleLogActorRole;
  reference: string;
  actorLabel: string;
  actionLabel: string;
  message: string;
  result: string;
  resultTone: BattleLogResultTone;
  className: string;
};

function toSafeNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRealtimeValue(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeEventType(event?: AutoCombatRealtimeEvent | null) {
  return normalizeRealtimeValue(event?.type);
}

function getEventSequence(event: AutoCombatRealtimeEvent) {
  const value = (event as AutoCombatRealtimeEventExtra).sequence;

  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getCreatedAtTimestamp(event: AutoCombatRealtimeEvent) {
  const createdAt = (event as AutoCombatRealtimeEventExtra).createdAt;

  if (!createdAt) {
    return undefined;
  }

  const parsed = Date.parse(createdAt);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getEventKey(event: AutoCombatRealtimeEvent) {
  const looseEvent = event as AutoCombatRealtimeEventExtra;

  return [
    looseEvent.eventId ?? looseEvent.id ?? 'no-event-id',
    looseEvent.sessionId ?? 'no-session',
    looseEvent.sequence ?? 'no-sequence',
    looseEvent.characterId ?? 'no-character',
    looseEvent.type ?? 'no-type',
    looseEvent.createdAt ?? 'no-created-at',

    looseEvent.enemyInstanceId ?? 'no-enemy-instance',
    looseEvent.mobId ?? 'no-mob',
    looseEvent.mobName ?? 'no-mob-name',
    looseEvent.round ?? 'no-round',
    looseEvent.combatIndex ?? 'no-combat',

    looseEvent.message ?? 'no-message',
    looseEvent.damage ?? 'no-damage',
    looseEvent.healedAmount ?? 'no-heal',

    looseEvent.characterCurrentHp ?? 'no-character-hp',
    looseEvent.characterMaxHp ?? 'no-character-max-hp',
    looseEvent.mobCurrentHp ?? 'no-mob-hp',
    looseEvent.mobMaxHp ?? 'no-mob-max-hp',

    looseEvent.xpGained ?? 'no-xp-gained',
    looseEvent.totalXp ?? looseEvent.characterXp ?? 'no-total-xp',
    looseEvent.characterLevel ?? 'no-character-level',

    looseEvent.totalCombats ?? 'no-total-combats',
    looseEvent.totalRounds ?? 'no-total-rounds',
    looseEvent.totalKills ?? 'no-total-kills',
    looseEvent.totalXpGained ?? 'no-total-xp-gained',
    looseEvent.totalLoot ?? 'no-total-loot',
    looseEvent.potionsUsed ?? 'no-potions-used',

    looseEvent.potionItemId ?? 'no-potion-item',
    looseEvent.potionQuantityBefore ?? 'no-potion-before',
    looseEvent.potionQuantityAfter ?? 'no-potion-after',
    looseEvent.potionQuantityRemaining ?? 'no-potion-remaining',
    looseEvent.potionUsedQuantity ?? 'no-potion-used-quantity',

    looseEvent.actor ?? 'no-actor',
    looseEvent.target ?? 'no-target',
  ].join('|');
}

function getMobSpawnDedupeKey(event: AutoCombatRealtimeEvent) {
  if (normalizeEventType(event) !== 'MOB_SPAWNED') {
    return '';
  }

  const looseEvent = event as AutoCombatRealtimeEventExtra;

  if (looseEvent.enemyInstanceId) {
    return [
      event.sessionId ?? 'no-session',
      looseEvent.characterId ?? 'no-character',
      looseEvent.enemyInstanceId,
      'mob-spawned',
    ].join('|');
  }

  if (event.combatIndex !== null && event.combatIndex !== undefined) {
    return [
      event.sessionId ?? 'no-session',
      looseEvent.characterId ?? 'no-character',
      event.combatIndex,
      'mob-spawned',
    ].join('|');
  }

  return [
    event.sessionId ?? 'no-session',
    looseEvent.characterId ?? 'no-character',
    event.mobId ?? 'no-mob',
    event.mobName ?? 'no-mob-name',
    'mob-spawned',
  ].join('|');
}

function getPotionUsedDedupeKey(event: AutoCombatRealtimeEvent) {
  if (normalizeEventType(event) !== 'POTION_USED') {
    return '';
  }

  const looseEvent = event as AutoCombatRealtimeEventExtra;

  return [
    looseEvent.eventId ?? looseEvent.id ?? 'no-event-id',
    looseEvent.sessionId ?? 'no-session',
    looseEvent.sequence ?? 'no-sequence',
    looseEvent.characterId ?? 'no-character',
    looseEvent.potionItemId ?? 'no-potion-item',
    looseEvent.potionQuantityBefore ?? 'no-before',
    looseEvent.potionQuantityAfter ?? 'no-after',
    looseEvent.potionQuantityRemaining ?? 'no-remaining',
    looseEvent.potionUsedQuantity ?? 'no-used',
    looseEvent.characterCurrentHp ?? 'no-character-hp',
    looseEvent.characterMaxHp ?? 'no-character-max-hp',
    looseEvent.round ?? 'no-round',
    looseEvent.combatIndex ?? 'no-combat',
  ].join('|');
}

function getGenericDedupeKey(event: AutoCombatRealtimeEvent) {
  const looseEvent = event as AutoCombatRealtimeEventExtra;

  return [
    looseEvent.eventId ?? looseEvent.id ?? 'no-event-id',
    looseEvent.sessionId ?? 'no-session',
    looseEvent.sequence ?? 'no-sequence',
    looseEvent.characterId ?? 'no-character',
    looseEvent.type ?? 'no-type',
    looseEvent.enemyInstanceId ?? 'no-enemy-instance',
    looseEvent.mobId ?? 'no-mob',
    looseEvent.round ?? 'no-round',
    looseEvent.combatIndex ?? 'no-combat',
    looseEvent.damage ?? 'no-damage',
    looseEvent.healedAmount ?? 'no-heal',
    looseEvent.characterCurrentHp ?? 'no-character-hp',
    looseEvent.mobCurrentHp ?? 'no-mob-hp',
    looseEvent.xpGained ?? 'no-xp-gained',
    looseEvent.totalXp ?? looseEvent.characterXp ?? 'no-xp',
    looseEvent.totalKills ?? 'no-kills',
    looseEvent.totalXpGained ?? 'no-total-xp-gained',
    looseEvent.potionsUsed ?? 'no-potions',
    looseEvent.potionItemId ?? 'no-potion-item',
    looseEvent.potionQuantityBefore ?? 'no-potion-before',
    looseEvent.potionQuantityAfter ?? 'no-potion-after',
    looseEvent.potionQuantityRemaining ?? 'no-potion-remaining',
  ].join('|');
}

function isSameDedupeScope(
  current: AutoCombatRealtimeEvent,
  incoming: AutoCombatRealtimeEvent,
) {
  const currentKey = getEventKey(current);
  const incomingKey = getEventKey(incoming);

  if (currentKey === incomingKey) {
    return true;
  }

  const currentSpawnKey = getMobSpawnDedupeKey(current);
  const incomingSpawnKey = getMobSpawnDedupeKey(incoming);

  if (
    currentSpawnKey &&
    incomingSpawnKey &&
    currentSpawnKey === incomingSpawnKey
  ) {
    return true;
  }

  const currentPotionKey = getPotionUsedDedupeKey(current);
  const incomingPotionKey = getPotionUsedDedupeKey(incoming);

  if (
    currentPotionKey &&
    incomingPotionKey &&
    currentPotionKey === incomingPotionKey
  ) {
    return true;
  }

  const currentGenericKey = getGenericDedupeKey(current);
  const incomingGenericKey = getGenericDedupeKey(incoming);

  return Boolean(
    currentGenericKey &&
      incomingGenericKey &&
      currentGenericKey === incomingGenericKey,
  );
}

function getStableRenderKey(event: AutoCombatRealtimeEvent, index: number) {
  const spawnKey = getMobSpawnDedupeKey(event);

  if (spawnKey) {
    return spawnKey;
  }

  const potionKey = getPotionUsedDedupeKey(event);

  if (potionKey) {
    return potionKey;
  }

  const genericKey = getGenericDedupeKey(event);

  if (genericKey) {
    return genericKey;
  }

  return `${getEventKey(event)}|${index}`;
}

function getBattleLogVisualType(
  event: AutoCombatRealtimeEvent,
): BattleLogVisualType {
  const type = normalizeEventType(event);

  switch (type) {
    case 'MOB_SPAWNED':
      return 'spawn';

    case 'PLAYER_HIT':
      return 'player-hit';

    case 'MOB_HIT':
      return 'mob-hit';

    case 'DODGE':
      return 'dodge';

    case 'POTION_USED':
      return 'potion';

    case 'MOB_DEFEATED':
      return 'mob-defeated';

    case 'PLAYER_DEFEATED':
      return 'player-defeated';

    default:
      return 'system';
  }
}

function getBattleLogActorRole(
  event: AutoCombatRealtimeEvent,
  type: BattleLogVisualType,
): BattleLogActorRole {
  const actor = normalizeRealtimeValue(event.actor);
  const target = normalizeRealtimeValue(event.target);

  if (type === 'spawn') {
    return 'system';
  }

  if (type === 'player-hit' || type === 'potion' || type === 'mob-defeated') {
    return 'player';
  }

  if (type === 'mob-hit' || type === 'player-defeated') {
    return 'mob';
  }

  if (type === 'dodge') {
    if (target === 'PLAYER') {
      return 'player';
    }

    if (target === 'MOB') {
      return 'mob';
    }

    if (actor === 'PLAYER') {
      return 'player';
    }

    if (actor === 'MOB') {
      return 'mob';
    }

    return 'system';
  }

  if (actor === 'PLAYER') {
    return 'player';
  }

  if (actor === 'MOB') {
    return 'mob';
  }

  return 'system';
}

function getBattleLogActorLabel(role: BattleLogActorRole) {
  const labels: Record<BattleLogActorRole, string> = {
    player: 'Jogador',
    mob: 'Monstro',
    system: 'Sistema',
  };

  return labels[role];
}

function getBattleLogActionLabel(type: BattleLogVisualType) {
  const labels: Record<BattleLogVisualType, string> = {
    spawn: 'Entrada',
    'player-hit': 'Ataque',
    'mob-hit': 'Ataque',
    dodge: 'Esquiva',
    potion: 'Cura',
    'mob-defeated': 'Abate',
    'player-defeated': 'Derrota',
    system: 'Evento',
  };

  return labels[type];
}

function getBattleLogClassName(params: {
  event: AutoCombatRealtimeEvent;
  type: BattleLogVisualType;
  role: BattleLogActorRole;
  resultTone: BattleLogResultTone;
  isActiveEvent: boolean;
}) {
  const { event, type, role, resultTone, isActiveEvent } = params;

  const classes = [
    'auto-combat-battle-log__item',
    `auto-combat-battle-log__item--${role}`,
    `auto-combat-battle-log__item--${type}`,
    `auto-combat-battle-log__item--result-${resultTone}`,
    `auto-combat-battle-log__item--${role}-side`,
    `is-${role}-side`,
  ];

  if (role === 'player') {
    classes.push('is-player-action');
  }

  if (role === 'mob') {
    classes.push('is-mob-action');
  }

  if (role === 'system') {
    classes.push('is-system-action');
  }

  if (type === 'player-hit') {
    classes.push('is-player-hit');
  }

  if (type === 'mob-hit') {
    classes.push('is-mob-hit');
  }

  if (type === 'dodge' || event.isDodged) {
    classes.push('is-dodge');
  }

  if (type === 'potion') {
    classes.push('is-potion-used');
  }

  if (type === 'mob-defeated') {
    classes.push('is-mob-defeated');
  }

  if (type === 'player-defeated') {
    classes.push('is-player-defeated');
  }

  if (type === 'spawn') {
    classes.push('is-mob-spawned');
  }

  if (event.isCritical) {
    classes.push('is-critical');
  }

  if (isActiveEvent) {
    classes.push('is-current-event', 'is-active-event');
  }

  return classes.join(' ');
}

function getBattleLogReference(event: AutoCombatRealtimeEvent) {
  const round = toSafeNumber(event.round, 0);

  if (round > 0) {
    return `Rodada ${round}`;
  }

  return 'Tempo real';
}

function buildFallbackMessage(
  event: AutoCombatRealtimeEvent,
  type: BattleLogVisualType,
) {
  const mobName = event.mobName ?? 'Infectado';

  switch (type) {
    case 'spawn':
      return `${mobName} apareceu.`;

    case 'player-hit':
      return `Você atingiu ${mobName}.`;

    case 'mob-hit':
      return `${mobName} atingiu o sobrevivente.`;

    case 'dodge':
      if (normalizeRealtimeValue(event.target) === 'PLAYER') {
        return 'O sobrevivente esquivou do ataque.';
      }

      if (normalizeRealtimeValue(event.target) === 'MOB') {
        return `${mobName} esquivou do ataque.`;
      }

      return 'Uma esquiva aconteceu.';

    case 'potion':
      return 'Poção utilizada.';

    case 'mob-defeated':
      return `${mobName} foi abatido.`;

    case 'player-defeated':
      return 'O sobrevivente foi derrotado.';

    default:
      return 'Evento de combate recebido.';
  }
}

function getBattleLogResult(params: {
  event: AutoCombatRealtimeEvent;
  type: BattleLogVisualType;
}): {
  result: string;
  tone: BattleLogResultTone;
} {
  const { event, type } = params;
  const looseEvent = event as AutoCombatRealtimeEventExtra;

  const damage = toSafeNumber(event.damage, 0);
  const xpGained = toSafeNumber(looseEvent.xpGained, 0);
  const healedAmount = toSafeNumber(looseEvent.healedAmount, 0);
  const potionsUsed = toSafeNumber(looseEvent.potionsUsed, 0);
  const totalKills = getOptionalNumber(looseEvent.totalKills);
  const totalXpGained = getOptionalNumber(looseEvent.totalXpGained);

  if (type === 'mob-defeated') {
    if (xpGained > 0 && looseEvent.leveledUp) {
      return {
        result: `+${xpGained} XP · Level up`,
        tone: 'xp',
      };
    }

    if (xpGained > 0) {
      return {
        result: `+${xpGained} XP`,
        tone: 'xp',
      };
    }

    if (totalXpGained !== undefined && totalXpGained > 0) {
      return {
        result: `${totalXpGained} XP total`,
        tone: 'xp',
      };
    }

    if (totalKills !== undefined && totalKills > 0) {
      return {
        result: `${totalKills} abate${totalKills === 1 ? '' : 's'}`,
        tone: 'xp',
      };
    }

    return {
      result: 'Abatido',
      tone: 'xp',
    };
  }

  if (type === 'potion') {
    if (healedAmount > 0) {
      return {
        result: `+${healedAmount} HP`,
        tone: 'heal',
      };
    }

    if (potionsUsed > 0) {
      return {
        result: `${potionsUsed} poção${potionsUsed === 1 ? '' : 'ões'}`,
        tone: 'heal',
      };
    }

    return {
      result: 'Cura',
      tone: 'heal',
    };
  }

  if (type === 'dodge' || event.isDodged) {
    return {
      result: 'Esquiva',
      tone: 'dodge',
    };
  }

  if (damage > 0) {
    if (event.isCritical) {
      return {
        result: `${damage} crítico`,
        tone: 'critical',
      };
    }

    return {
      result: `${damage} dano`,
      tone: 'damage',
    };
  }

  if (type === 'spawn') {
    return {
      result: 'Novo mob',
      tone: 'info',
    };
  }

  if (type === 'player-defeated') {
    return {
      result: 'Derrota',
      tone: 'danger',
    };
  }

  return {
    result: '—',
    tone: 'empty',
  };
}

function normalizeBattleLogItem(
  event: AutoCombatRealtimeEvent,
  activeEvent: AutoCombatRealtimeEvent | null,
  index: number,
): NormalizedBattleLogItem {
  const key = getStableRenderKey(event, index);
  const type = getBattleLogVisualType(event);
  const role = getBattleLogActorRole(event, type);
  const result = getBattleLogResult({ event, type });
  const isActiveEvent = Boolean(activeEvent && isSameDedupeScope(event, activeEvent));

  return {
    key,
    type,
    role,
    reference: getBattleLogReference(event),
    actorLabel: getBattleLogActorLabel(role),
    actionLabel: getBattleLogActionLabel(type),
    message: event.message ?? buildFallbackMessage(event, type),
    result: result.result,
    resultTone: result.tone,
    className: getBattleLogClassName({
      event,
      type,
      role,
      resultTone: result.tone,
      isActiveEvent,
    }),
  };
}

function compareDecoratedEventsChronologically(
  a: DecoratedBattleLogEvent,
  b: DecoratedBattleLogEvent,
) {
  const sequenceA = getEventSequence(a.event);
  const sequenceB = getEventSequence(b.event);

  if (
    sequenceA !== undefined &&
    sequenceB !== undefined &&
    sequenceA !== sequenceB
  ) {
    return sequenceA - sequenceB;
  }

  const combatA = toSafeNumber(a.event.combatIndex, 0);
  const combatB = toSafeNumber(b.event.combatIndex, 0);

  if (combatA !== combatB) {
    return combatA - combatB;
  }

  const roundA = toSafeNumber(a.event.round, 0);
  const roundB = toSafeNumber(b.event.round, 0);

  if (roundA !== roundB) {
    return roundA - roundB;
  }

  const createdAtA = getCreatedAtTimestamp(a.event);
  const createdAtB = getCreatedAtTimestamp(b.event);

  if (
    createdAtA !== undefined &&
    createdAtB !== undefined &&
    createdAtA !== createdAtB
  ) {
    return createdAtA - createdAtB;
  }

  /**
   * Não ordenar por tipo/ator aqui. Quando PLAYER_HIT e MOB_HIT chegam na
   * mesma rodada sem sequence/createdAt distintos, uma prioridade por tipo
   * move ataques do jogador para cima de ataques do monstro já renderizados.
   * O fallback deve preservar a sequência em que o reducer acumulou os eventos.
   */
  return a.sourceIndex - b.sourceIndex;
}

function shouldReplaceExistingEvent(params: {
  existing: DecoratedBattleLogEvent;
  incoming: DecoratedBattleLogEvent;
}) {
  const { existing, incoming } = params;

  if (incoming.isActiveEvent && !existing.isActiveEvent) {
    return true;
  }

  if (!incoming.isActiveEvent && existing.isActiveEvent) {
    return false;
  }

  const incomingCreatedAt = getCreatedAtTimestamp(incoming.event);
  const existingCreatedAt = getCreatedAtTimestamp(existing.event);

  if (
    incomingCreatedAt !== undefined &&
    existingCreatedAt !== undefined &&
    incomingCreatedAt !== existingCreatedAt
  ) {
    return incomingCreatedAt > existingCreatedAt;
  }

  return incoming.sourceIndex > existing.sourceIndex;
}

function getUniqueDecoratedEvents(events: DecoratedBattleLogEvent[]) {
  const uniqueEvents: DecoratedBattleLogEvent[] = [];

  for (const incoming of events) {
    const existingIndex = uniqueEvents.findIndex((current) =>
      isSameDedupeScope(current.event, incoming.event),
    );

    if (existingIndex < 0) {
      uniqueEvents.push(incoming);
      continue;
    }

    const existing = uniqueEvents[existingIndex];

    if (
      shouldReplaceExistingEvent({
        existing,
        incoming,
      })
    ) {
      uniqueEvents[existingIndex] = incoming;
    }
  }

  return uniqueEvents;
}

function getEventCombatIndex(event?: AutoCombatRealtimeEvent | null) {
  return getOptionalNumber(event?.combatIndex);
}

function getEventMobIdentity(event?: AutoCombatRealtimeEvent | null) {
  if (!event) return '';

  return String(event.enemyInstanceId ?? event.mobId ?? event.mobName ?? '').trim();
}

function shouldHideRepeatedSpawn(params: {
  currentEvent: AutoCombatRealtimeEvent;
  previousVisibleEvent?: AutoCombatRealtimeEvent;
}) {
  const { currentEvent, previousVisibleEvent } = params;

  if (normalizeEventType(currentEvent) !== 'MOB_SPAWNED') {
    return false;
  }

  if (!previousVisibleEvent) {
    return false;
  }

  if (normalizeEventType(previousVisibleEvent) !== 'MOB_SPAWNED') {
    return false;
  }

  const currentCombatIndex = getEventCombatIndex(currentEvent);
  const previousCombatIndex = getEventCombatIndex(previousVisibleEvent);

  if (
    currentCombatIndex !== undefined &&
    previousCombatIndex !== undefined &&
    currentCombatIndex !== previousCombatIndex
  ) {
    return false;
  }

  const currentMobIdentity = getEventMobIdentity(currentEvent);
  const previousMobIdentity = getEventMobIdentity(previousVisibleEvent);

  if (!currentMobIdentity || !previousMobIdentity) {
    return true;
  }

  return currentMobIdentity === previousMobIdentity;
}

function hideNoisySpawnEvents(events: AutoCombatRealtimeEvent[]) {
  const visibleEvents: AutoCombatRealtimeEvent[] = [];

  for (const event of events) {
    const previousVisibleEvent = visibleEvents[visibleEvents.length - 1];

    if (
      shouldHideRepeatedSpawn({
        currentEvent: event,
        previousVisibleEvent,
      })
    ) {
      continue;
    }

    visibleEvents.push(event);
  }

  return visibleEvents;
}

function buildMergedEvents(params: {
  events: AutoCombatRealtimeEvent[];
  activeEvent: AutoCombatRealtimeEvent | null;
  maxItems: number;
}) {
  const { events, activeEvent, maxItems } = params;

  const decoratedEvents: DecoratedBattleLogEvent[] = [];
  /**
   * O reducer mantém battleLogEvents com o mais recente primeiro. Para renderizar
   * antigo -> recente sem reordenar eventos da mesma rodada pelo ator/tipo,
   * convertemos o índice de origem para uma posição cronológica ascendente.
   */
  const lastEventIndex = Math.max(0, events.length - 1);

  events.forEach((event, index) => {
    decoratedEvents.push({
      event,
      sourceIndex: lastEventIndex - index,
      isActiveEvent: Boolean(activeEvent && isSameDedupeScope(event, activeEvent)),
    });
  });

  if (
    activeEvent &&
    !decoratedEvents.some((item) => isSameDedupeScope(item.event, activeEvent))
  ) {
    decoratedEvents.push({
      event: activeEvent,
      sourceIndex: events.length,
      isActiveEvent: true,
    });
  }

  const uniqueEvents = getUniqueDecoratedEvents(decoratedEvents);

  const sortedEvents = [...uniqueEvents].sort(
    compareDecoratedEventsChronologically,
  );

  const cleanedEvents = hideNoisySpawnEvents(
    sortedEvents.map((item) => item.event),
  );

  return cleanedEvents.slice(Math.max(0, cleanedEvents.length - maxItems));
}

export function AutoCombatBattleLog({
  events,
  activeEvent = null,
  maxItems = 40,
  isActive = false,
  title = 'Log da batalha',
  emptyMessage = 'Aguardando o primeiro evento do combate em tempo real...',
  className = '',
}: AutoCombatBattleLogProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const logItems = useMemo(() => {
    const visibleEvents = buildMergedEvents({
      events,
      activeEvent,
      maxItems,
    });

    return visibleEvents.map((event, index) =>
      normalizeBattleLogItem(event, activeEvent, index),
    );
  }, [activeEvent, events, maxItems]);

  const latestItemKey = logItems[logItems.length - 1]?.key ?? '';

  useEffect(() => {
    const listElement = listRef.current;

    if (!listElement) {
      return;
    }

    listElement.scrollTop = listElement.scrollHeight;
  }, [logItems.length, latestItemKey]);

  const rootClassName = [
    'auto-combat-battle-log',
    'auto-combat-battle-log--side-layout',
    isActive ? 'is-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={rootClassName}>
      <header className="auto-combat-battle-log__header">
        <strong>{title}</strong>
      </header>

      {logItems.length > 0 ? (
        <div
          ref={listRef}
          className="auto-combat-battle-log__list"
          role="log"
          aria-live={isActive ? 'polite' : 'off'}
          aria-label="Eventos recentes do combate"
        >
          {logItems.map((item, index) => (
            <div
              key={item.key}
              className="auto-combat-battle-log__row"
              data-log-role={item.role}
              data-log-type={item.type}
              data-log-result={item.resultTone}
            >
              {index > 0 ? (
                <div
                  className="auto-combat-battle-log__separator"
                  aria-hidden="true"
                />
              ) : null}

              <div className={item.className}>
                <div className="auto-combat-battle-log__meta">
                  <span className="auto-combat-battle-log__round">
                    {item.reference}
                  </span>

                  <span className="auto-combat-battle-log__actor">
                    {item.actorLabel}
                  </span>

                  <span className="auto-combat-battle-log__action">
                    {item.actionLabel}
                  </span>
                </div>

                <div className="auto-combat-battle-log__message">
                  <span>{item.message}</span>
                </div>

                <span
                  className={[
                    'auto-combat-battle-log__damage',
                    'auto-combat-battle-log__result',
                    `auto-combat-battle-log__result--${item.resultTone}`,
                  ].join(' ')}
                >
                  {item.result}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="auto-combat-battle-log__empty">{emptyMessage}</div>
      )}
    </article>
  );
}
