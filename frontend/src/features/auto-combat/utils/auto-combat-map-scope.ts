import type {
  AutoCombatMapViewModel,
  AutoCombatSessionApiViewModel,
  AutoCombatStatusResponse,
} from '../types/auto-combat.types';

const TERMINAL_SESSION_STATUSES = new Set([
  'STOPPED',
  'FINISHED',
  'COMPLETED',
  'DEFEATED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'CANCELED',
]);

function getStatusSession(status: AutoCombatStatusResponse) {
  return (
    status.session ??
    status.activeSession ??
    status.autoCombatSession ??
    status.lastSession ??
    null
  );
}

function isActiveStatus(
  status: AutoCombatStatusResponse,
  session: AutoCombatSessionApiViewModel | null,
) {
  const sessionStatus = String(session?.status ?? '').trim().toUpperCase();
  const sessionPhase = String(session?.phase ?? status.phase ?? '')
    .trim()
    .toUpperCase();

  if (TERMINAL_SESSION_STATUSES.has(sessionStatus)) {
    return false;
  }

  if (sessionPhase === 'ENCOUNTER_READY') {
    return false;
  }

  return (
    sessionStatus === 'ACTIVE' ||
    status.active === true ||
    status.hasActiveAutoCombat === true
  );
}

export function getAutoCombatStatusMapId(
  status: AutoCombatStatusResponse | null,
) {
  if (!status) return null;

  const session = getStatusSession(status);

  return (
    session?.mapId ??
    status.currentMapId ??
    status.hunting?.mapId ??
    status.huntBatch?.mapId ??
    status.autoCombatRecovery?.mapId ??
    session?.autoCombatRecovery?.mapId ??
    status.subMap?.map?.id ??
    status.map?.id ??
    null
  );
}

export function scopeInactiveAutoCombatStatusToMap(
  status: AutoCombatStatusResponse | null,
  mapId?: string | null,
) {
  if (!status || !mapId) return status;

  const session = getStatusSession(status);

  if (isActiveStatus(status, session)) {
    return status;
  }

  const statusMapId = getAutoCombatStatusMapId(status);

  return !statusMapId || statusMapId === mapId ? status : null;
}

export function scopeInactiveAutoCombatSessionToMap(
  session: AutoCombatSessionApiViewModel | null,
  mapId?: string | null,
) {
  if (!session || !mapId) return session;

  const sessionStatus = String(session.status ?? '').trim().toUpperCase();
  const sessionPhase = String(session.phase ?? '').trim().toUpperCase();

  if (
    !TERMINAL_SESSION_STATUSES.has(sessionStatus) &&
    sessionPhase !== 'ENCOUNTER_READY'
  ) {
    return session;
  }

  return !session.mapId || session.mapId === mapId ? session : null;
}

type AutoCombatMapSelectionParams = {
  maps: AutoCombatMapViewModel[];
  activeSessionMapId?: string | null;
  currentSelectionMapId?: string | null;
  requestedMapId?: string | null;
  requestedSubMapId?: string | null;
  characterMapId?: string | null;
};

export function resolveAutoCombatSelectedMapId({
  maps,
  activeSessionMapId,
  currentSelectionMapId,
  requestedMapId,
  requestedSubMapId,
  characterMapId,
}: AutoCombatMapSelectionParams) {
  const hasMap = (mapId?: string | null) =>
    Boolean(mapId && maps.some((gameMap) => gameMap.id === mapId));

  if (hasMap(activeSessionMapId)) return activeSessionMapId ?? '';
  if (hasMap(currentSelectionMapId)) return currentSelectionMapId ?? '';
  if (hasMap(requestedMapId)) return requestedMapId ?? '';

  if (requestedSubMapId) {
    const requestedSubMapParent = maps.find((gameMap) =>
      gameMap.subMaps?.some((subMap) => subMap.id === requestedSubMapId),
    );

    if (requestedSubMapParent) return requestedSubMapParent.id;
  }

  if (hasMap(characterMapId)) return characterMapId ?? '';

  return maps[0]?.id ?? '';
}
