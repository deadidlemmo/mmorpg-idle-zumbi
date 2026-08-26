import { Injectable } from '@nestjs/common';
import {
  CharacterPetStatus,
  MaterialOrigin,
  PetEffectType,
  PetSpecialization,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BASIS_POINTS_SCALE,
  type EquippedPetBonus,
  matchesPetBonusTarget,
  type PetBonusTarget,
  reduceDurationByBasisPoints,
} from './pet-bonus';

const GATHERING_SPECIALIZATION_BY_ORIGIN: Partial<
  Record<MaterialOrigin, PetSpecialization>
> = {
  DESMANCHE: PetSpecialization.GATHERING_DESMANCHE,
  COLETA: PetSpecialization.GATHERING_COLETA,
  PATRULHA: PetSpecialization.GATHERING_PATRULHA,
  ARSENAL: PetSpecialization.GATHERING_ARSENAL,
  TECNOVARREDURA: PetSpecialization.GATHERING_TECNOVARREDURA,
  CONTENCAO: PetSpecialization.GATHERING_CONTENCAO,
};

@Injectable()
export class PetBonusesService {
  constructor(private readonly prisma: PrismaService) {}

  async getEquippedBonus(
    characterId: string,
    target: PetBonusTarget,
  ): Promise<EquippedPetBonus | null> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: {
        equippedPet: {
          select: {
            id: true,
            characterId: true,
            status: true,
            petDefinition: {
              select: {
                id: true,
                key: true,
                name: true,
                tier: true,
                specialization: true,
                effectType: true,
                effectBasisPoints: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    const equippedPet = character?.equippedPet;
    if (
      !equippedPet ||
      equippedPet.characterId !== characterId ||
      equippedPet.status !== CharacterPetStatus.AVAILABLE ||
      !equippedPet.petDefinition.isActive
    ) {
      return null;
    }

    const effectBasisPoints = Math.min(
      BASIS_POINTS_SCALE,
      Math.max(0, equippedPet.petDefinition.effectBasisPoints),
    );
    const bonus: EquippedPetBonus = {
      characterPetId: equippedPet.id,
      petDefinitionId: equippedPet.petDefinition.id,
      petKey: equippedPet.petDefinition.key,
      petName: equippedPet.petDefinition.name,
      tier: equippedPet.petDefinition.tier,
      specialization: equippedPet.petDefinition.specialization,
      effectType: equippedPet.petDefinition.effectType,
      effectBasisPoints,
      remainingBasisPoints: BASIS_POINTS_SCALE - effectBasisPoints,
    };

    return matchesPetBonusTarget(bonus, target) ? bonus : null;
  }

  async calculateDuration(
    characterId: string,
    target: PetBonusTarget,
    baseDurationMs: number,
    minimumDurationMs = 0,
  ) {
    const bonus = await this.getEquippedBonus(characterId, target);
    return {
      durationMs: reduceDurationByBasisPoints(
        baseDurationMs,
        bonus?.effectBasisPoints ?? 0,
        minimumDurationMs,
      ),
      bonus,
    };
  }

  calculateGatheringDuration(
    characterId: string,
    origin: MaterialOrigin,
    baseDurationMs: number,
    minimumDurationMs = 0,
  ) {
    const specialization = GATHERING_SPECIALIZATION_BY_ORIGIN[origin];
    if (!specialization) {
      return Promise.resolve({
        durationMs: reduceDurationByBasisPoints(
          baseDurationMs,
          0,
          minimumDurationMs,
        ),
        bonus: null,
      });
    }

    return this.calculateDuration(
      characterId,
      {
        effectType: PetEffectType.GATHERING_TIME_REDUCTION,
        specialization,
      },
      baseDurationMs,
      minimumDurationMs,
    );
  }

  calculateAutoCombatTtk(
    characterId: string,
    baseDurationMs: number,
    minimumDurationMs = 0,
  ) {
    return this.calculateDuration(
      characterId,
      {
        effectType: PetEffectType.AUTO_COMBAT_TTK_REDUCTION,
        specialization: PetSpecialization.AUTO_COMBAT_TTK,
      },
      baseDurationMs,
      minimumDurationMs,
    );
  }

  calculateHuntingDuration(
    characterId: string,
    baseDurationMs: number,
    minimumDurationMs = 0,
  ) {
    return this.calculateDuration(
      characterId,
      {
        effectType: PetEffectType.HUNTING_TIME_REDUCTION,
        specialization: PetSpecialization.AUTO_COMBAT_HUNTING,
      },
      baseDurationMs,
      minimumDurationMs,
    );
  }
}
