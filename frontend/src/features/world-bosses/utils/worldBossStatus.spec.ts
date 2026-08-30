import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorldBossStatusResponse } from '../types/world-bosses.types.ts';
import {
  mergeWorldBossStatusSnapshot,
  reconcileWorldBossStatusSnapshots,
  upsertWorldBossStatusSnapshot,
} from './worldBossStatus.ts';

function buildStatus(params: {
  currentHp: number;
  eventId?: string;
  updatedAt: string;
}): WorldBossStatusResponse {
  return {
    serverNow: params.updatedAt,
    event: {
      id: params.eventId ?? 'event-1',
      updatedAt: params.updatedAt,
      status: 'ACTIVE',
      startsAt: '2026-08-26T12:00:00.000Z',
      endsAt: '2026-08-26T13:00:00.000Z',
      remainingSeconds: 3_600,
      currentHp: params.currentHp,
      maxHp: 1_000,
      hpPercent: params.currentHp / 10,
      progressPercent: 100 - params.currentHp / 10,
      totalDamage: 1_000 - params.currentHp,
      participantCount: 1,
      worldBoss: {
        id: 'boss-1',
        name: 'Síndico Devorado',
        slug: 'sindico-devorado',
        tier: 1,
        bossLevel: 10,
        minLevel: 1,
        maxLevel: 10,
        durationSeconds: 3_600,
        difficulty: 'LOW',
        riskLevel: 1,
        attackPower: 1,
        defense: 1,
        resistance: 1,
        mutationLevel: 1,
        map: { id: 'map-1', name: 'Subúrbio Silencioso', tier: 1 },
        rewards: [],
      },
    },
    participant: null,
  };
}

test('rejeita snapshot antigo que tentaria devolver HP ao boss', () => {
  const current = buildStatus({
    currentHp: 400,
    updatedAt: '2026-08-26T12:00:10.000Z',
  });
  const stale = buildStatus({
    currentHp: 700,
    updatedAt: '2026-08-26T12:00:05.000Z',
  });

  assert.strictEqual(mergeWorldBossStatusSnapshot(current, stale), current);
});

test('aceita snapshot mais novo e preserva elegibilidade omitida no socket', () => {
  const current = {
    ...buildStatus({
      currentHp: 700,
      updatedAt: '2026-08-26T12:00:05.000Z',
    }),
    eligible: { canJoin: true },
  };
  const next = buildStatus({
    currentHp: 400,
    updatedAt: '2026-08-26T12:00:10.000Z',
  });
  const merged = mergeWorldBossStatusSnapshot(current, next);

  assert.equal(merged.event?.currentHp, 400);
  assert.deepEqual(merged.eligible, { canJoin: true });
});

test('preserva o participante quando o evento coletivo envia apenas o estado público', () => {
  const current = {
    ...buildStatus({
      currentHp: 700,
      updatedAt: '2026-08-26T12:00:05.000Z',
    }),
    participant: {
      id: 'participant-1',
      damageDealt: 0,
      contributionPercent: 0,
      joinedAt: '2026-08-26T11:30:00.000Z',
      lastContributionAt: '2026-08-26T11:30:00.000Z',
      activeSeconds: 0,
      rewardGranted: false,
      eligibleForReward: false,
      registrationStatus: 'REGISTERED' as const,
    },
  };
  const publicSnapshot = buildStatus({
    currentHp: 650,
    updatedAt: '2026-08-26T12:00:10.000Z',
  });
  delete publicSnapshot.participant;

  const merged = mergeWorldBossStatusSnapshot(current, publicSnapshot);

  assert.equal(merged.event?.currentHp, 650);
  assert.equal(merged.participant?.id, 'participant-1');
});

test('usa a mesma proteção no upsert realtime e na reconciliação REST', () => {
  const current = buildStatus({
    currentHp: 400,
    updatedAt: '2026-08-26T12:00:10.000Z',
  });
  const stale = buildStatus({
    currentHp: 700,
    updatedAt: '2026-08-26T12:00:05.000Z',
  });

  assert.equal(upsertWorldBossStatusSnapshot([current], stale)[0], current);
  assert.equal(
    reconcileWorldBossStatusSnapshots([current], [stale])[0],
    current,
  );
});
