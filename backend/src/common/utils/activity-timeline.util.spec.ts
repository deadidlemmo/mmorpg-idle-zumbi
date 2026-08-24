import { buildActivityTimelineSnapshot } from './activity-timeline.util';

describe('activity timeline snapshot', () => {
  it('gera o contrato canonico com datas em UTC', () => {
    expect(
      buildActivityTimelineSnapshot({
        activityInstanceId: ' gathering-1 ',
        cycleId: ' cycle-4 ',
        serverNow: '2026-08-23T12:00:01-03:00',
        startedAt: '2026-08-23T15:00:00.000Z',
        endsAt: '2026-08-23T15:00:03.000Z',
        durationMs: 3_000,
        direction: 'fill',
        version: 4,
      }),
    ).toEqual({
      activityInstanceId: 'gathering-1',
      cycleId: 'cycle-4',
      serverNow: '2026-08-23T15:00:01.000Z',
      startedAt: '2026-08-23T15:00:00.000Z',
      endsAt: '2026-08-23T15:00:03.000Z',
      durationMs: 3_000,
      direction: 'fill',
      version: 4,
    });
  });

  it('aceita snapshots recebidos depois do fim do ciclo', () => {
    expect(
      buildActivityTimelineSnapshot({
        activityInstanceId: 'incursion-1',
        cycleId: 'incursion-cycle',
        serverNow: '2026-08-23T15:00:10.000Z',
        startedAt: '2026-08-23T15:00:00.000Z',
        endsAt: '2026-08-23T15:00:05.000Z',
        durationMs: 5_000,
        direction: 'fill',
        version: 2,
      }).serverNow,
    ).toBe('2026-08-23T15:00:10.000Z');
  });

  it('rejeita duracao incoerente com as ancoras do servidor', () => {
    expect(() =>
      buildActivityTimelineSnapshot({
        activityInstanceId: 'world-boss-1',
        cycleId: 'boss-cycle',
        serverNow: '2026-08-23T15:00:01.000Z',
        startedAt: '2026-08-23T15:00:00.000Z',
        endsAt: '2026-08-23T15:00:03.000Z',
        durationMs: 2_000,
        direction: 'drain',
        version: 1,
      }),
    ).toThrow('durationMs deve corresponder exatamente');
  });

  it('rejeita identificadores e versoes invalidas', () => {
    expect(() =>
      buildActivityTimelineSnapshot({
        activityInstanceId: '',
        cycleId: 'cycle-1',
        serverNow: 1_000,
        startedAt: 1_000,
        endsAt: 2_000,
        durationMs: 1_000,
        direction: 'drain',
        version: 0,
      }),
    ).toThrow('activityInstanceId deve ser informado');
  });
});
