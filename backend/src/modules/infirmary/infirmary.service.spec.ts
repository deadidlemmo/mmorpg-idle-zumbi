import { CharacterStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InfirmaryService } from './infirmary.service';

describe('InfirmaryService concurrency', () => {
  it('inicia o atendimento sob o mesmo bloqueio transacional das atividades', async () => {
    type TreatmentUpdate = {
      where: {
        id: string;
        userId: string;
        infirmaryEndsAt: null;
      };
      data: {
        infirmaryStartedAt: Date;
        infirmaryEndsAt: Date;
      };
    };
    const character = {
      id: 'character-1',
      userId: 'user-1',
      name: 'Nilcruz',
      status: CharacterStatus.DEAD,
      level: 1,
      currentHp: 0,
      maxHp: 100,
      infirmaryStartedAt: null,
      infirmaryEndsAt: null,
      class: {
        name: 'Lutador',
        baseStrength: 5,
        baseVitality: 5,
        baseAgility: 5,
        basePrecision: 5,
        baseTechnique: 5,
        baseWillpower: 5,
      },
      equipment: null,
      gatheringSkills: [],
    };
    const captured: { treatmentUpdate?: TreatmentUpdate } = {};
    const updateMany = jest.fn((update: TreatmentUpdate) => {
      captured.treatmentUpdate = update;
      return Promise.resolve({ count: 1 });
    });
    const tx = { character: { updateMany } };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;
    const activityGuard = {
      ensureCanUseInfirmary: jest.fn().mockResolvedValue({}),
    };
    const service = new InfirmaryService(prisma, activityGuard as never);
    jest
      .spyOn(service as any, 'findResolvedCharacter')
      .mockResolvedValue(character);
    jest
      .spyOn(service as any, 'findCharacterWithStats')
      .mockResolvedValue(character);
    jest.spyOn(service, 'getStatus').mockResolvedValue({} as never);

    await service.startTreatment('user-1', 'character-1');

    expect(activityGuard.ensureCanUseInfirmary).toHaveBeenCalledWith({
      characterId: 'character-1',
      userId: 'user-1',
      client: tx,
      lockCharacter: true,
    });
    const treatmentUpdate = captured.treatmentUpdate;
    expect(treatmentUpdate).toBeDefined();
    if (!treatmentUpdate) {
      throw new Error('A atualização do atendimento não foi executada.');
    }
    expect(treatmentUpdate.where).toEqual({
      id: 'character-1',
      userId: 'user-1',
      infirmaryEndsAt: null,
    });
    expect(treatmentUpdate.data.infirmaryStartedAt).toBeInstanceOf(Date);
    expect(treatmentUpdate.data.infirmaryEndsAt).toBeInstanceOf(Date);
    expect(treatmentUpdate.data.infirmaryEndsAt.getTime()).toBeGreaterThan(
      treatmentUpdate.data.infirmaryStartedAt.getTime(),
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
