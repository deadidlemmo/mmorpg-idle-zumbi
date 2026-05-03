import { useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../../../services/api/authToken';
import {
  connectAutoCombatSocket,
  type AutoCombatConnectedPayload,
  type AutoCombatJoinedPayload,
  type AutoCombatLeftPayload,
  type AutoCombatSocket,
  type AutoCombatSocketError,
} from '../../../services/websocket/socketClient';
import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from '../types/auto-combat.types';

type UseAutoCombatSocketOptions = {
  characterId?: string | null;
  enabled?: boolean;

  onStatus?: (payload: AutoCombatStatusResponse) => void;
  onSessionUpdated?: (payload: AutoCombatStatusResponse) => void;
  onFinished?: (payload: AutoCombatStatusResponse) => void;
  onStopped?: (payload: AutoCombatStatusResponse) => void;

  onRealtimeEvent?: (payload: AutoCombatRealtimeEvent) => void;
  onMobSpawned?: (payload: AutoCombatRealtimeEvent) => void;
  onHit?: (payload: AutoCombatRealtimeEvent) => void;
  onDodge?: (payload: AutoCombatRealtimeEvent) => void;
  onMobDefeated?: (payload: AutoCombatRealtimeEvent) => void;
  onPlayerDefeated?: (payload: AutoCombatRealtimeEvent) => void;
  onPotionUsed?: (payload: AutoCombatRealtimeEvent) => void;

  onError?: (message: string) => void;
};

type AutoCombatRealtimeEventLoose = AutoCombatRealtimeEvent & {
  createdAt?: string | null;

  characterXp?: number | null;
  characterLevel?: number | null;
  totalXp?: number | null;

  totalKills?: number | null;
  totalXpGained?: number | null;
  totalLoot?: number | null;
  potionsUsed?: number | null;

  healedAmount?: number | null;

  potionItemId?: string | null;
  potionItemName?: string | null;
  potionTriggerPercent?: number | null;
  potionQuantityBefore?: number | null;
  potionQuantityAfter?: number | null;
  potionQuantityRemaining?: number | null;
  potionUsedQuantity?: number | null;
};

type UseAutoCombatSocketState = {
  socket: AutoCombatSocket | null;
  isConnected: boolean;
  isJoined: boolean;
  errorMessage: string;
  lastEvent: AutoCombatRealtimeEvent | null;
};

function getStatusSession(payload: AutoCombatStatusResponse | null) {
  if (!payload) return null;

  return (
    payload.session ??
    payload.activeSession ??
    payload.autoCombatSession ??
    payload.lastSession ??
    null
  );
}

function getStatusCharacterId(payload: AutoCombatStatusResponse | null) {
  if (!payload) return null;

  return payload.character?.id ?? getStatusSession(payload)?.characterId ?? null;
}

function isStatusForCharacter(
  characterId: string,
  payload: AutoCombatStatusResponse | null,
) {
  const payloadCharacterId = getStatusCharacterId(payload);

  return !payloadCharacterId || payloadCharacterId === characterId;
}

function isEventForCharacter(
  characterId: string,
  payload: AutoCombatRealtimeEvent | null,
) {
  if (!payload) return false;

  return !payload.characterId || payload.characterId === characterId;
}

function getRealtimeEventType(payload: AutoCombatRealtimeEvent | null) {
  return String(payload?.type ?? '').trim().toUpperCase();
}

function isActiveStatus(status?: string | null) {
  return String(status ?? '').trim().toUpperCase() === 'ACTIVE';
}

function isTerminalStatus(status?: string | null) {
  const normalizedStatus = String(status ?? '').trim().toUpperCase();

  return (
    normalizedStatus === 'FINISHED' ||
    normalizedStatus === 'STOPPED' ||
    normalizedStatus === 'DEFEATED' ||
    normalizedStatus === 'FAILED' ||
    normalizedStatus === 'CANCELLED'
  );
}

function getRealtimeEventKey(payload: AutoCombatRealtimeEvent) {
  const event = payload as AutoCombatRealtimeEventLoose;

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

function getMobSpawnFingerprint(payload: AutoCombatRealtimeEvent) {
  if (getRealtimeEventType(payload) !== 'MOB_SPAWNED') {
    return '';
  }

  return [
    payload.sessionId ?? 'no-session',
    payload.characterId ?? 'no-character',
    payload.mobId ?? 'no-mob',
    payload.mobName ?? 'no-mob-name',
    payload.combatIndex ?? 'no-combat',
  ].join('|');
}

function getPotionUsedFingerprint(payload: AutoCombatRealtimeEvent) {
  if (getRealtimeEventType(payload) !== 'POTION_USED') {
    return '';
  }

  const event = payload as AutoCombatRealtimeEventLoose;

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

function getGenericRealtimeFingerprint(payload: AutoCombatRealtimeEvent) {
  const event = payload as AutoCombatRealtimeEventLoose;

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

function areSocketStatesEqual(
  current: UseAutoCombatSocketState,
  next: UseAutoCombatSocketState,
) {
  return (
    current.socket === next.socket &&
    current.isConnected === next.isConnected &&
    current.isJoined === next.isJoined &&
    current.errorMessage === next.errorMessage &&
    current.lastEvent === next.lastEvent
  );
}

export function useAutoCombatSocket(options: UseAutoCombatSocketOptions) {
  const {
    characterId,
    enabled = true,
    onStatus,
    onSessionUpdated,
    onFinished,
    onStopped,
    onRealtimeEvent,
    onMobSpawned,
    onHit,
    onDodge,
    onMobDefeated,
    onPlayerDefeated,
    onPotionUsed,
    onError,
  } = options;

  const [state, setState] = useState<UseAutoCombatSocketState>({
    socket: null,
    isConnected: false,
    isJoined: false,
    errorMessage: '',
    lastEvent: null,
  });

  const handlersRef = useRef({
    onStatus,
    onSessionUpdated,
    onFinished,
    onStopped,
    onRealtimeEvent,
    onMobSpawned,
    onHit,
    onDodge,
    onMobDefeated,
    onPlayerDefeated,
    onPotionUsed,
    onError,
  });

  const activeCharacterIdRef = useRef<string | null>(characterId ?? null);
  const lastEventKeyRef = useRef('');
  const lastErrorMessageRef = useRef('');

  const processedRealtimeEventKeysRef = useRef<Set<string>>(new Set());
  const processedMobSpawnFingerprintsRef = useRef<Set<string>>(new Set());
  const processedPotionUsedFingerprintsRef = useRef<Set<string>>(new Set());
  const processedGenericFingerprintsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    handlersRef.current = {
      onStatus,
      onSessionUpdated,
      onFinished,
      onStopped,
      onRealtimeEvent,
      onMobSpawned,
      onHit,
      onDodge,
      onMobDefeated,
      onPlayerDefeated,
      onPotionUsed,
      onError,
    };
  }, [
    onStatus,
    onSessionUpdated,
    onFinished,
    onStopped,
    onRealtimeEvent,
    onMobSpawned,
    onHit,
    onDodge,
    onMobDefeated,
    onPlayerDefeated,
    onPotionUsed,
    onError,
  ]);

  useEffect(() => {
    activeCharacterIdRef.current = characterId ?? null;
  }, [characterId]);

  useEffect(() => {
    if (!enabled || !characterId) {
      activeCharacterIdRef.current = null;
      lastEventKeyRef.current = '';
      lastErrorMessageRef.current = '';
      processedRealtimeEventKeysRef.current.clear();
      processedMobSpawnFingerprintsRef.current.clear();
      processedPotionUsedFingerprintsRef.current.clear();
      processedGenericFingerprintsRef.current.clear();

      setState((current) => {
        const next: UseAutoCombatSocketState = {
          socket: null,
          isConnected: false,
          isJoined: false,
          errorMessage: '',
          lastEvent: null,
        };

        return areSocketStatesEqual(current, next) ? current : next;
      });

      return;
    }

    const token = getAuthToken();

    if (!token) {
      const message =
        'Token de autenticação não encontrado. Faça login novamente.';

      activeCharacterIdRef.current = characterId;
      lastEventKeyRef.current = '';
      lastErrorMessageRef.current = message;
      processedRealtimeEventKeysRef.current.clear();
      processedMobSpawnFingerprintsRef.current.clear();
      processedPotionUsedFingerprintsRef.current.clear();
      processedGenericFingerprintsRef.current.clear();

      setState((current) => {
        const next: UseAutoCombatSocketState = {
          socket: null,
          isConnected: false,
          isJoined: false,
          errorMessage: message,
          lastEvent: null,
        };

        return areSocketStatesEqual(current, next) ? current : next;
      });

      handlersRef.current.onError?.(message);

      return;
    }

    const currentSocket = connectAutoCombatSocket();

    let isDisposed = false;
    let hasJoinedCharacterRoom = false;
    let isJoiningCharacterRoom = false;
    let joinTimeoutId: number | undefined;

    activeCharacterIdRef.current = characterId;

    currentSocket.auth = {
      token,
    };

    lastEventKeyRef.current = '';
    lastErrorMessageRef.current = '';
    processedRealtimeEventKeysRef.current.clear();
    processedMobSpawnFingerprintsRef.current.clear();
    processedPotionUsedFingerprintsRef.current.clear();
    processedGenericFingerprintsRef.current.clear();

    setState((current) => {
      const next: UseAutoCombatSocketState = {
        socket: currentSocket,
        isConnected: currentSocket.connected,
        isJoined: false,
        errorMessage: '',
        lastEvent: null,
      };

      return areSocketStatesEqual(current, next) ? current : next;
    });

    function updateConnectionState(params: {
      isConnected?: boolean;
      isJoined?: boolean;
      errorMessage?: string;
      lastEvent?: AutoCombatRealtimeEvent | null;
      socket?: AutoCombatSocket | null;
    }) {
      if (isDisposed) return;

      setState((current) => {
        const next: UseAutoCombatSocketState = {
          socket:
            params.socket !== undefined ? params.socket : current.socket,
          isConnected:
            params.isConnected !== undefined
              ? params.isConnected
              : current.isConnected,
          isJoined:
            params.isJoined !== undefined ? params.isJoined : current.isJoined,
          errorMessage:
            params.errorMessage !== undefined
              ? params.errorMessage
              : current.errorMessage,
          lastEvent:
            params.lastEvent !== undefined
              ? params.lastEvent
              : current.lastEvent,
        };

        return areSocketStatesEqual(current, next) ? current : next;
      });
    }

    function safeSetError(message: string) {
      if (isDisposed) return;

      if (lastErrorMessageRef.current === message) {
        return;
      }

      lastErrorMessageRef.current = message;

      updateConnectionState({
        errorMessage: message,
      });

      handlersRef.current.onError?.(message);
    }

    function clearSocketError() {
      if (isDisposed) return;

      if (lastErrorMessageRef.current === '') {
        return;
      }

      lastErrorMessageRef.current = '';

      updateConnectionState({
        errorMessage: '',
      });
    }

    function clearLastEvent() {
      if (isDisposed) return;

      if (!lastEventKeyRef.current) {
        return;
      }

      lastEventKeyRef.current = '';

      updateConnectionState({
        lastEvent: null,
      });
    }

    function setLastRealtimeEvent(payload: AutoCombatRealtimeEvent) {
      if (isDisposed) return;

      const eventKey = getRealtimeEventKey(payload);

      if (lastEventKeyRef.current === eventKey) {
        return;
      }

      lastEventKeyRef.current = eventKey;

      updateConnectionState({
        lastEvent: payload,
      });
    }

    function clearJoinTimeout() {
      if (joinTimeoutId !== undefined) {
        window.clearTimeout(joinTimeoutId);
        joinTimeoutId = undefined;
      }
    }

    function trimProcessedEventsCache() {
      if (processedRealtimeEventKeysRef.current.size > 700) {
        processedRealtimeEventKeysRef.current = new Set(
          Array.from(processedRealtimeEventKeysRef.current).slice(-350),
        );
      }

      if (processedMobSpawnFingerprintsRef.current.size > 240) {
        processedMobSpawnFingerprintsRef.current = new Set(
          Array.from(processedMobSpawnFingerprintsRef.current).slice(-120),
        );
      }

      if (processedPotionUsedFingerprintsRef.current.size > 240) {
        processedPotionUsedFingerprintsRef.current = new Set(
          Array.from(processedPotionUsedFingerprintsRef.current).slice(-120),
        );
      }

      if (processedGenericFingerprintsRef.current.size > 700) {
        processedGenericFingerprintsRef.current = new Set(
          Array.from(processedGenericFingerprintsRef.current).slice(-350),
        );
      }
    }

    function shouldProcessRealtimeEvent(payload: AutoCombatRealtimeEvent) {
      const eventKey = getRealtimeEventKey(payload);
      const spawnFingerprint = getMobSpawnFingerprint(payload);
      const potionUsedFingerprint = getPotionUsedFingerprint(payload);
      const genericFingerprint = getGenericRealtimeFingerprint(payload);

      if (processedRealtimeEventKeysRef.current.has(eventKey)) {
        return false;
      }

      if (
        genericFingerprint &&
        processedGenericFingerprintsRef.current.has(genericFingerprint)
      ) {
        return false;
      }

      if (
        spawnFingerprint &&
        processedMobSpawnFingerprintsRef.current.has(spawnFingerprint)
      ) {
        return false;
      }

      if (
        potionUsedFingerprint &&
        processedPotionUsedFingerprintsRef.current.has(potionUsedFingerprint)
      ) {
        return false;
      }

      processedRealtimeEventKeysRef.current.add(eventKey);

      if (genericFingerprint) {
        processedGenericFingerprintsRef.current.add(genericFingerprint);
      }

      if (spawnFingerprint) {
        processedMobSpawnFingerprintsRef.current.add(spawnFingerprint);
      }

      if (potionUsedFingerprint) {
        processedPotionUsedFingerprintsRef.current.add(potionUsedFingerprint);
      }

      trimProcessedEventsCache();

      return true;
    }

    function joinCharacterRoom() {
      if (
        isDisposed ||
        !characterId ||
        !currentSocket.connected ||
        hasJoinedCharacterRoom ||
        isJoiningCharacterRoom
      ) {
        return;
      }

      isJoiningCharacterRoom = true;

      currentSocket.emit('auto-combat:join', {
        characterId,
      });
    }

    function scheduleJoinCharacterRoom(delayMs = 80) {
      clearJoinTimeout();

      joinTimeoutId = window.setTimeout(() => {
        joinCharacterRoom();
      }, delayMs);
    }

    function handleConnect() {
      if (isDisposed) return;

      hasJoinedCharacterRoom = false;
      isJoiningCharacterRoom = false;

      updateConnectionState({
        isConnected: true,
        isJoined: false,
      });

      clearSocketError();
      scheduleJoinCharacterRoom();
    }

    function handleAuthenticatedConnection(
      _payload: AutoCombatConnectedPayload,
    ) {
      if (isDisposed) return;

      updateConnectionState({
        isConnected: true,
      });

      clearSocketError();
      scheduleJoinCharacterRoom(40);
    }

    function handleJoined(payload: AutoCombatJoinedPayload) {
      if (isDisposed) return;

      if (payload.characterId !== characterId) {
        return;
      }

      hasJoinedCharacterRoom = true;
      isJoiningCharacterRoom = false;

      updateConnectionState({
        isJoined: true,
      });

      clearSocketError();
    }

    function handleLeft(payload: AutoCombatLeftPayload) {
      if (isDisposed) return;

      if (payload.characterId !== characterId) {
        return;
      }

      hasJoinedCharacterRoom = false;
      isJoiningCharacterRoom = false;

      updateConnectionState({
        isJoined: false,
      });
    }

    function handleDisconnect() {
      if (isDisposed) return;

      hasJoinedCharacterRoom = false;
      isJoiningCharacterRoom = false;

      updateConnectionState({
        isConnected: false,
        isJoined: false,
      });
    }

    function handleConnectError(error: Error) {
      if (isDisposed) return;

      hasJoinedCharacterRoom = false;
      isJoiningCharacterRoom = false;

      const message =
        error?.message ||
        'Não foi possível conectar ao WebSocket do combate.';

      updateConnectionState({
        isConnected: false,
        isJoined: false,
      });

      safeSetError(message);
    }

    function handleSocketError(payload: AutoCombatSocketError) {
      if (isDisposed) return;

      const message = payload.message || 'Erro no WebSocket do combate.';

      if (
        message.toLowerCase().includes('socket não autenticado') ||
        message.toLowerCase().includes('token') ||
        message.toLowerCase().includes('personagem não encontrado')
      ) {
        hasJoinedCharacterRoom = false;
        isJoiningCharacterRoom = false;

        updateConnectionState({
          isJoined: false,
        });
      }

      safeSetError(message);
    }

    function handleStatus(payload: AutoCombatStatusResponse) {
      if (isDisposed || !isStatusForCharacter(characterId, payload)) {
        return;
      }

      clearSocketError();

      const session = getStatusSession(payload);
      const sessionIsActive =
        Boolean(payload.active) ||
        Boolean(payload.hasActiveAutoCombat) ||
        isActiveStatus(session?.status);

      if (sessionIsActive) {
        hasJoinedCharacterRoom = true;
        isJoiningCharacterRoom = false;

        updateConnectionState({
          isJoined: true,
        });
      }

      if (isTerminalStatus(session?.status)) {
        clearLastEvent();
      }

      handlersRef.current.onStatus?.(payload);
    }

    function handleSessionUpdated(payload: AutoCombatStatusResponse) {
      if (isDisposed || !isStatusForCharacter(characterId, payload)) {
        return;
      }

      clearSocketError();

      const session = getStatusSession(payload);
      const sessionIsActive =
        Boolean(payload.active) ||
        Boolean(payload.hasActiveAutoCombat) ||
        isActiveStatus(session?.status);

      if (sessionIsActive) {
        hasJoinedCharacterRoom = true;
        isJoiningCharacterRoom = false;

        updateConnectionState({
          isJoined: true,
        });
      }

      if (isTerminalStatus(session?.status)) {
        clearLastEvent();
      }

      handlersRef.current.onSessionUpdated?.(payload);
    }

    function handleFinished(payload: AutoCombatStatusResponse) {
      if (isDisposed || !isStatusForCharacter(characterId, payload)) {
        return;
      }

      clearSocketError();
      clearLastEvent();

      handlersRef.current.onFinished?.(payload);
    }

    function handleStopped(payload: AutoCombatStatusResponse) {
      if (isDisposed || !isStatusForCharacter(characterId, payload)) {
        return;
      }

      clearSocketError();
      clearLastEvent();

      handlersRef.current.onStopped?.(payload);
    }

    function handleRealtimeEvent(
      payload: AutoCombatRealtimeEvent,
      callback?: (payload: AutoCombatRealtimeEvent) => void,
    ) {
      if (isDisposed || !isEventForCharacter(characterId, payload)) {
        return;
      }

      if (!shouldProcessRealtimeEvent(payload)) {
        return;
      }

      clearSocketError();
      setLastRealtimeEvent(payload);

      handlersRef.current.onRealtimeEvent?.(payload);
      callback?.(payload);
    }

    function handleMobSpawned(payload: AutoCombatRealtimeEvent) {
      handleRealtimeEvent(payload, handlersRef.current.onMobSpawned);
    }

    function handleHit(payload: AutoCombatRealtimeEvent) {
      const eventType = getRealtimeEventType(payload);

      if (eventType === 'DODGE') {
        handleDodge(payload);
        return;
      }

      handleRealtimeEvent(payload, handlersRef.current.onHit);
    }

    function handleDodge(payload: AutoCombatRealtimeEvent) {
      handleRealtimeEvent(payload, (event) => {
        if (handlersRef.current.onDodge) {
          handlersRef.current.onDodge(event);
          return;
        }

        handlersRef.current.onHit?.(event);
      });
    }

    function handleMobDefeated(payload: AutoCombatRealtimeEvent) {
      handleRealtimeEvent(payload, handlersRef.current.onMobDefeated);
    }

    function handlePlayerDefeated(payload: AutoCombatRealtimeEvent) {
      handleRealtimeEvent(payload, handlersRef.current.onPlayerDefeated);
    }

    function handlePotionUsed(payload: AutoCombatRealtimeEvent) {
      handleRealtimeEvent(payload, handlersRef.current.onPotionUsed);
    }

    function handleGenericRealtimeEvent(payload: AutoCombatRealtimeEvent) {
      const eventType = getRealtimeEventType(payload);

      if (eventType === 'MOB_SPAWNED') {
        handleMobSpawned(payload);
        return;
      }

      if (eventType === 'PLAYER_HIT' || eventType === 'MOB_HIT') {
        handleHit(payload);
        return;
      }

      if (eventType === 'DODGE') {
        handleDodge(payload);
        return;
      }

      if (eventType === 'POTION_USED') {
        handlePotionUsed(payload);
        return;
      }

      if (eventType === 'MOB_DEFEATED') {
        handleMobDefeated(payload);
        return;
      }

      if (eventType === 'PLAYER_DEFEATED') {
        handlePlayerDefeated(payload);
        return;
      }

      handleRealtimeEvent(payload);
    }

    currentSocket.off('connect', handleConnect);
    currentSocket.off('disconnect', handleDisconnect);
    currentSocket.off('connect_error', handleConnectError);
    currentSocket.off('exception', handleSocketError);

    currentSocket.off('auto-combat:connected', handleAuthenticatedConnection);
    currentSocket.off('auto-combat:joined', handleJoined);
    currentSocket.off('auto-combat:left', handleLeft);
    currentSocket.off('auto-combat:error', handleSocketError);

    currentSocket.off('auto-combat:status', handleStatus);
    currentSocket.off('auto-combat:session-updated', handleSessionUpdated);
    currentSocket.off('auto-combat:finished', handleFinished);
    currentSocket.off('auto-combat:stopped', handleStopped);

    currentSocket.off('auto-combat:event', handleGenericRealtimeEvent);
    currentSocket.off('auto-combat:mob-spawned', handleMobSpawned);
    currentSocket.off('auto-combat:hit', handleHit);
    currentSocket.off('auto-combat:dodge', handleDodge);
    currentSocket.off('auto-combat:mob-defeated', handleMobDefeated);
    currentSocket.off('auto-combat:player-defeated', handlePlayerDefeated);
    currentSocket.off('auto-combat:potion-used', handlePotionUsed);

    currentSocket.on('connect', handleConnect);
    currentSocket.on('disconnect', handleDisconnect);
    currentSocket.on('connect_error', handleConnectError);
    currentSocket.on('exception', handleSocketError);

    currentSocket.on('auto-combat:connected', handleAuthenticatedConnection);
    currentSocket.on('auto-combat:joined', handleJoined);
    currentSocket.on('auto-combat:left', handleLeft);
    currentSocket.on('auto-combat:error', handleSocketError);

    currentSocket.on('auto-combat:status', handleStatus);
    currentSocket.on('auto-combat:session-updated', handleSessionUpdated);
    currentSocket.on('auto-combat:finished', handleFinished);
    currentSocket.on('auto-combat:stopped', handleStopped);

    currentSocket.on('auto-combat:event', handleGenericRealtimeEvent);
    currentSocket.on('auto-combat:mob-spawned', handleMobSpawned);
    currentSocket.on('auto-combat:hit', handleHit);
    currentSocket.on('auto-combat:dodge', handleDodge);
    currentSocket.on('auto-combat:mob-defeated', handleMobDefeated);
    currentSocket.on('auto-combat:player-defeated', handlePlayerDefeated);
    currentSocket.on('auto-combat:potion-used', handlePotionUsed);

    if (currentSocket.connected) {
      updateConnectionState({
        isConnected: true,
        isJoined: false,
      });

      scheduleJoinCharacterRoom();
    } else {
      currentSocket.connect();
    }

    return () => {
      isDisposed = true;

      clearJoinTimeout();

      if (currentSocket.connected && characterId) {
        currentSocket.emit('auto-combat:leave', {
          characterId,
        });
      }

      currentSocket.off('connect', handleConnect);
      currentSocket.off('disconnect', handleDisconnect);
      currentSocket.off('connect_error', handleConnectError);
      currentSocket.off('exception', handleSocketError);

      currentSocket.off(
        'auto-combat:connected',
        handleAuthenticatedConnection,
      );
      currentSocket.off('auto-combat:joined', handleJoined);
      currentSocket.off('auto-combat:left', handleLeft);
      currentSocket.off('auto-combat:error', handleSocketError);

      currentSocket.off('auto-combat:status', handleStatus);
      currentSocket.off('auto-combat:session-updated', handleSessionUpdated);
      currentSocket.off('auto-combat:finished', handleFinished);
      currentSocket.off('auto-combat:stopped', handleStopped);

      currentSocket.off('auto-combat:event', handleGenericRealtimeEvent);
      currentSocket.off('auto-combat:mob-spawned', handleMobSpawned);
      currentSocket.off('auto-combat:hit', handleHit);
      currentSocket.off('auto-combat:dodge', handleDodge);
      currentSocket.off('auto-combat:mob-defeated', handleMobDefeated);
      currentSocket.off('auto-combat:player-defeated', handlePlayerDefeated);
      currentSocket.off('auto-combat:potion-used', handlePotionUsed);
    };
  }, [characterId, enabled]);

  return {
    socket: state.socket,
    isConnected: state.isConnected,
    isJoined: state.isJoined,
    errorMessage: state.errorMessage,
    lastEvent: state.lastEvent,
  };
}