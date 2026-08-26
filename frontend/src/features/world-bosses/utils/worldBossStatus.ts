import type { WorldBossStatusResponse } from '../types/world-bosses.types';

function getSnapshotTimestamp(status?: WorldBossStatusResponse | null) {
  const value = status?.event?.updatedAt ?? status?.serverNow ?? null;
  const parsed = value ? Date.parse(value) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

export function mergeWorldBossStatusSnapshot(
  previous: WorldBossStatusResponse | null,
  next: WorldBossStatusResponse,
): WorldBossStatusResponse {
  const previousEventId = previous?.event?.id ?? null;
  const nextEventId = next.event?.id ?? null;

  if (previousEventId && previousEventId === nextEventId) {
    const previousTimestamp = getSnapshotTimestamp(previous);
    const nextTimestamp = getSnapshotTimestamp(next);

    if (
      previousTimestamp !== null &&
      nextTimestamp !== null &&
      nextTimestamp < previousTimestamp &&
      previous
    ) {
      return previous;
    }
  }

  return {
    ...next,
    eligible:
      next.eligible ??
      (previousEventId === nextEventId ? previous?.eligible : undefined),
  } satisfies WorldBossStatusResponse;
}

export function upsertWorldBossStatusSnapshot(
  previous: WorldBossStatusResponse[],
  next: WorldBossStatusResponse,
) {
  if (!next.event) return previous;

  let wasUpdated = false;
  const updated = previous.map((item) => {
    if (item.event?.id !== next.event?.id) return item;

    wasUpdated = true;
    return mergeWorldBossStatusSnapshot(item, next);
  });

  return wasUpdated ? updated : [...previous, next];
}

export function reconcileWorldBossStatusSnapshots(
  previous: WorldBossStatusResponse[],
  incoming: WorldBossStatusResponse[],
) {
  const previousByEventId = new Map(
    previous
      .filter((status) => status.event)
      .map((status) => [status.event!.id, status]),
  );

  return incoming.map((status) => {
    const eventId = status.event?.id;
    const current = eventId ? previousByEventId.get(eventId) ?? null : null;

    return mergeWorldBossStatusSnapshot(current, status);
  });
}
