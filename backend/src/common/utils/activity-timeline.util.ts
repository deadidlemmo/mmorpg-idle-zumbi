export type ActivityTimelineDirection = 'fill' | 'drain';

export interface ActivityTimelineSnapshot {
  activityInstanceId: string;
  cycleId: string;
  serverNow: string;
  startedAt: string;
  endsAt: string;
  durationMs: number;
  direction: ActivityTimelineDirection;
  version: number;
}

export interface BuildActivityTimelineSnapshotParams {
  activityInstanceId: string;
  cycleId: string;
  serverNow: Date | string | number;
  startedAt: Date | string | number;
  endsAt: Date | string | number;
  durationMs: number;
  direction: ActivityTimelineDirection;
  version: number;
}

function normalizeIdentifier(value: string, field: string) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new Error(`${field} deve ser informado.`);
  }

  return normalized;
}

function normalizeTimestamp(value: Date | string | number, field: string) {
  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} deve ser uma data valida.`);
  }

  return timestamp;
}

export function buildActivityTimelineSnapshot(
  params: BuildActivityTimelineSnapshotParams,
): ActivityTimelineSnapshot {
  const activityInstanceId = normalizeIdentifier(
    params.activityInstanceId,
    'activityInstanceId',
  );
  const cycleId = normalizeIdentifier(params.cycleId, 'cycleId');
  const serverNowMs = normalizeTimestamp(params.serverNow, 'serverNow');
  const startedAtMs = normalizeTimestamp(params.startedAt, 'startedAt');
  const endsAtMs = normalizeTimestamp(params.endsAt, 'endsAt');

  if (!Number.isInteger(params.durationMs) || params.durationMs <= 0) {
    throw new Error('durationMs deve ser um inteiro positivo.');
  }

  if (endsAtMs <= startedAtMs) {
    throw new Error('endsAt deve ser posterior a startedAt.');
  }

  if (endsAtMs - startedAtMs !== params.durationMs) {
    throw new Error(
      'durationMs deve corresponder exatamente ao intervalo entre startedAt e endsAt.',
    );
  }

  if (params.direction !== 'fill' && params.direction !== 'drain') {
    throw new Error('direction deve ser fill ou drain.');
  }

  if (!Number.isInteger(params.version) || params.version < 1) {
    throw new Error('version deve ser um inteiro positivo.');
  }

  return {
    activityInstanceId,
    cycleId,
    serverNow: new Date(serverNowMs).toISOString(),
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    durationMs: params.durationMs,
    direction: params.direction,
    version: params.version,
  };
}
