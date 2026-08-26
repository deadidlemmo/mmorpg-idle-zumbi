import {
  AutoCombatSessionPhase,
  AutoCombatSessionStatus,
} from '@prisma/client';

import { buildAutoCombatHuntingTimeline } from './auto-combat-hunting-timeline';

const BASE_PARAMS = {
  sessionId: 'session-1',
  huntBatchId: 'hunt-batch-1',
  status: AutoCombatSessionStatus.ACTIVE,
  phase: AutoCombatSessionPhase.HUNTING,
  isLimitReached: false,
  foundEnemiesCount: 7,
  serverNow: new Date('2026-08-23T12:00:05.000Z'),
  lastFindAt: new Date('2026-08-23T12:00:00.000Z'),
  nextFindAt: new Date('2026-08-23T12:00:15.000Z'),
};

describe('buildAutoCombatHuntingTimeline', () => {
  it('gera o ciclo canonico seguinte com relogio do servidor', () => {
    expect(buildAutoCombatHuntingTimeline(BASE_PARAMS)).toEqual({
      activityInstanceId: 'hunt-batch-1',
      cycleId: 'session-1:hunt:8',
      serverNow: '2026-08-23T12:00:05.000Z',
      startedAt: '2026-08-23T12:00:00.000Z',
      endsAt: '2026-08-23T12:00:15.000Z',
      durationMs: 15_000,
      direction: 'fill',
      version: 8,
    });
  });

  it.each([
    {
      status: AutoCombatSessionStatus.FINISHED,
      phase: AutoCombatSessionPhase.HUNTING,
      isLimitReached: false,
    },
    {
      status: AutoCombatSessionStatus.ACTIVE,
      phase: AutoCombatSessionPhase.ENCOUNTER_READY,
      isLimitReached: false,
    },
    {
      status: AutoCombatSessionStatus.ACTIVE,
      phase: AutoCombatSessionPhase.HUNTING,
      isLimitReached: true,
    },
  ])('nao publica timeline fora de uma caca ativa', (override) => {
    expect(
      buildAutoCombatHuntingTimeline({
        ...BASE_PARAMS,
        ...override,
      }),
    ).toBeNull();
  });

  it('usa a sessao como instancia quando nao existe lote persistido', () => {
    const timeline = buildAutoCombatHuntingTimeline({
      ...BASE_PARAMS,
      huntBatchId: null,
      foundEnemiesCount: 0,
    });

    expect(timeline).toMatchObject({
      activityInstanceId: 'session-1',
      cycleId: 'session-1:hunt:1',
      version: 1,
    });
  });

  it('preserva versao e duracao fracionaria do ciclo persistido apos F5', () => {
    const timeline = buildAutoCombatHuntingTimeline({
      ...BASE_PARAMS,
      cycleVersion: 19,
      lastFindAt: new Date('2026-08-23T12:00:00.000Z'),
      nextFindAt: new Date('2026-08-23T12:00:14.550Z'),
    });

    expect(timeline).toMatchObject({
      cycleId: 'session-1:hunt:19',
      durationMs: 14_550,
      version: 19,
    });
  });
});
