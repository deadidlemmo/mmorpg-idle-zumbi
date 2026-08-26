import { PetEffectType, PetSpecialization } from '@prisma/client';
import {
  BASIS_POINTS_SCALE,
  matchesPetBonusTarget,
  normalizeBasisPoints,
  reduceDurationByBasisPoints,
} from './pet-bonus';

describe('pet bonus basis points', () => {
  it.each([
    [300, 19_400],
    [400, 19_200],
    [500, 19_000],
    [600, 18_800],
    [750, 18_500],
  ])('reduz 20 segundos com %i pontos-base', (basisPoints, expected) => {
    expect(reduceDurationByBasisPoints(20_000, basisPoints)).toBe(expected);
  });

  it('respeita o piso definido pelo sistema consumidor', () => {
    expect(reduceDurationByBasisPoints(1_000, 750, 950)).toBe(950);
  });

  it('normaliza os pontos-base sem depender de porcentagens decimais', () => {
    expect(normalizeBasisPoints(750.9)).toBe(750);
    expect(normalizeBasisPoints(-1)).toBe(0);
    expect(normalizeBasisPoints(BASIS_POINTS_SCALE + 1)).toBe(
      BASIS_POINTS_SCALE,
    );
  });

  it('aplica somente a especialização e o efeito solicitados', () => {
    const bonus = {
      effectType: PetEffectType.GATHERING_TIME_REDUCTION,
      specialization: PetSpecialization.GATHERING_COLETA,
    };

    expect(
      matchesPetBonusTarget(bonus, {
        effectType: PetEffectType.GATHERING_TIME_REDUCTION,
        specialization: PetSpecialization.GATHERING_COLETA,
      }),
    ).toBe(true);
    expect(
      matchesPetBonusTarget(bonus, {
        effectType: PetEffectType.GATHERING_TIME_REDUCTION,
        specialization: PetSpecialization.GATHERING_DESMANCHE,
      }),
    ).toBe(false);
    expect(
      matchesPetBonusTarget(bonus, {
        effectType: PetEffectType.AUTO_COMBAT_TTK_REDUCTION,
      }),
    ).toBe(false);
  });
});
