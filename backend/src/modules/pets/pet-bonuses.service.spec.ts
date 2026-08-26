import {
  CharacterPetStatus,
  MaterialOrigin,
  PetEffectType,
  PetSpecialization,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PetBonusesService } from './pet-bonuses.service';

describe('PetBonusesService', () => {
  const findUnique = jest.fn();
  const service = new PetBonusesService({
    character: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('retorna o modificador do pet equipado para o efeito correto', async () => {
    findUnique.mockResolvedValue({
      equippedPet: {
        id: 'character-pet-id',
        characterId: 'character-id',
        status: CharacterPetStatus.AVAILABLE,
        petDefinition: {
          id: 'pet-definition-id',
          key: 'coleta-t5',
          name: 'Catador da Quarentena',
          tier: 5,
          specialization: PetSpecialization.GATHERING_COLETA,
          effectType: PetEffectType.GATHERING_TIME_REDUCTION,
          effectBasisPoints: 750,
          isActive: true,
        },
      },
    });

    await expect(
      service.calculateGatheringDuration(
        'character-id',
        MaterialOrigin.COLETA,
        5_000,
      ),
    ).resolves.toMatchObject({
      durationMs: 4_625,
      bonus: {
        characterPetId: 'character-pet-id',
        effectBasisPoints: 750,
        remainingBasisPoints: 9_250,
      },
    });
  });

  it.each([
    [MaterialOrigin.DESMANCHE, PetSpecialization.GATHERING_DESMANCHE],
    [MaterialOrigin.COLETA, PetSpecialization.GATHERING_COLETA],
    [MaterialOrigin.PATRULHA, PetSpecialization.GATHERING_PATRULHA],
    [MaterialOrigin.ARSENAL, PetSpecialization.GATHERING_ARSENAL],
    [MaterialOrigin.TECNOVARREDURA, PetSpecialization.GATHERING_TECNOVARREDURA],
    [MaterialOrigin.CONTENCAO, PetSpecialization.GATHERING_CONTENCAO],
  ])(
    'aplica o pet especializado na origem %s',
    async (origin, specialization) => {
      findUnique.mockResolvedValue({
        equippedPet: {
          id: `character-pet-${origin}`,
          characterId: 'character-id',
          status: CharacterPetStatus.AVAILABLE,
          petDefinition: {
            id: `pet-definition-${origin}`,
            key: `pet-${origin}`,
            name: `Pet ${origin}`,
            tier: 1,
            specialization,
            effectType: PetEffectType.GATHERING_TIME_REDUCTION,
            effectBasisPoints: 300,
            isActive: true,
          },
        },
      });

      await expect(
        service.calculateGatheringDuration('character-id', origin, 10_000),
      ).resolves.toMatchObject({
        durationMs: 9_700,
        bonus: {
          specialization,
          effectBasisPoints: 300,
        },
      });
    },
  );

  it('não consulta pet para drops de monstros, que não são gathering especializado', async () => {
    await expect(
      service.calculateGatheringDuration(
        'character-id',
        MaterialOrigin.DROP_MOBS,
        5_000,
      ),
    ).resolves.toEqual({ durationMs: 5_000, bonus: null });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('reduz o tempo de caça somente com o pet especializado em rastreio', async () => {
    findUnique.mockResolvedValue({
      equippedPet: {
        id: 'character-pet-hunting',
        characterId: 'character-id',
        status: CharacterPetStatus.AVAILABLE,
        petDefinition: {
          id: 'pet-definition-hunting',
          key: 'rastreador-t5',
          name: 'Rastreador da Quarentena',
          tier: 5,
          specialization: PetSpecialization.AUTO_COMBAT_HUNTING,
          effectType: PetEffectType.HUNTING_TIME_REDUCTION,
          effectBasisPoints: 750,
          isActive: true,
        },
      },
    });

    await expect(
      service.calculateHuntingDuration('character-id', 15_000, 1_000),
    ).resolves.toMatchObject({
      durationMs: 13_875,
      bonus: {
        specialization: PetSpecialization.AUTO_COMBAT_HUNTING,
        effectBasisPoints: 750,
      },
    });
  });

  it('reduz o TTK com precisão em milissegundos e respeita o piso de um segundo', async () => {
    findUnique.mockResolvedValue({
      equippedPet: {
        id: 'character-pet-auto-combat',
        characterId: 'character-id',
        status: CharacterPetStatus.AVAILABLE,
        petDefinition: {
          id: 'pet-definition-auto-combat',
          key: 'executor-t5',
          name: 'Executor da Quarentena',
          tier: 5,
          specialization: PetSpecialization.AUTO_COMBAT_TTK,
          effectType: PetEffectType.AUTO_COMBAT_TTK_REDUCTION,
          effectBasisPoints: 750,
          isActive: true,
        },
      },
    });

    await expect(
      service.calculateAutoCombatTtk('character-id', 15_000, 1_000),
    ).resolves.toMatchObject({
      durationMs: 13_875,
      bonus: {
        specialization: PetSpecialization.AUTO_COMBAT_TTK,
        effectBasisPoints: 750,
      },
    });

    await expect(
      service.calculateAutoCombatTtk('character-id', 1_000, 1_000),
    ).resolves.toMatchObject({
      durationMs: 1_000,
    });
  });

  it('ignora pet de outro personagem ou de outra especialização', async () => {
    findUnique.mockResolvedValue({
      equippedPet: {
        id: 'character-pet-id',
        characterId: 'another-character-id',
        status: CharacterPetStatus.AVAILABLE,
        petDefinition: {
          id: 'pet-definition-id',
          key: 'coleta-t5',
          name: 'Catador da Quarentena',
          tier: 5,
          specialization: PetSpecialization.GATHERING_COLETA,
          effectType: PetEffectType.GATHERING_TIME_REDUCTION,
          effectBasisPoints: 750,
          isActive: true,
        },
      },
    });

    await expect(
      service.getEquippedBonus('character-id', {
        effectType: PetEffectType.GATHERING_TIME_REDUCTION,
        specialization: PetSpecialization.GATHERING_DESMANCHE,
      }),
    ).resolves.toBeNull();
  });
});
