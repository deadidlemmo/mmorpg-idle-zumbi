import {
  getPetDuplicateCocoonRecovery,
  PET_DEFINITIONS,
  PET_TIME_REDUCTION_BASIS_POINTS_BY_TIER,
} from './economy.config';

describe('pet catalog contract', () => {
  it('define oito especializações em cada tier jogável', () => {
    expect(PET_DEFINITIONS).toHaveLength(40);

    for (let tier = 1; tier <= 5; tier += 1) {
      const definitions = PET_DEFINITIONS.filter((pet) => pet.tier === tier);
      expect(definitions).toHaveLength(8);
      expect(new Set(definitions.map((pet) => pet.specialization)).size).toBe(
        8,
      );
    }
  });

  it('mantém identificadores e nomes únicos', () => {
    expect(new Set(PET_DEFINITIONS.map((pet) => pet.key)).size).toBe(40);
    expect(new Set(PET_DEFINITIONS.map((pet) => pet.name)).size).toBe(40);
    expect(new Set(PET_DEFINITIONS.map((pet) => pet.cocoonItemSlug)).size).toBe(
      40,
    );
  });

  it('usa o bônus em pontos-base e recompra por quarenta por cento do custo', () => {
    for (const definition of PET_DEFINITIONS) {
      expect(definition.effectBasisPoints).toBe(
        PET_TIME_REDUCTION_BASIS_POINTS_BY_TIER[definition.tier],
      );
      expect(definition.npcSaleGold).toBe(
        Math.floor(definition.goldCost * 0.4),
      );
    }
  });

  it('converte repetidos em fragmentos ou metade do valor do pet', () => {
    for (let tier = 1; tier <= 5; tier += 1) {
      const recovery = getPetDuplicateCocoonRecovery(tier);
      const definition = PET_DEFINITIONS.find((pet) => pet.tier === tier)!;

      expect(recovery).toEqual({
        fragmentsPerCocoon: 10,
        goldPerCocoon: Math.floor(definition.npcSaleGold * 0.5),
      });
    }
  });
});
