import { WorldBossEventStatus } from '@prisma/client';
import { buildActiveWorldBossParticipationWhere } from './characters.service';

describe('CharactersService World Boss activity projection', () => {
  it('não projeta uma simples inscrição como atividade ativa', () => {
    const now = new Date('2026-08-29T12:00:00.000Z');

    expect(buildActiveWorldBossParticipationWhere('character-1', now)).toEqual({
      characterId: 'character-1',
      leftAt: null,
      confirmedAt: { not: null },
      event: {
        status: WorldBossEventStatus.ACTIVE,
        endsAt: { gt: now },
      },
    });
  });
});
