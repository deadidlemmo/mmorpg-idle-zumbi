import { AutoCombatService } from './auto-combat.service';

type FighterFixture = {
  name: string;
  className: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  precision: number;
  technique: number;
  agility: number;
};

type AppliedPetBonusFixture = {
  petDefinitionId: string;
  effectBasisPoints: number;
  effectPercent?: number;
};

type AutoCombatTtkFixture = {
  unmodifiedKillTimeMs: number;
  estimatedKillTimeMs: number;
  estimatedKillTimeSeconds: number;
  appliedPetBonus: AppliedPetBonusFixture | null;
};

type BattleProgressFixture = AutoCombatTtkFixture & {
  progressSeconds: number;
  cycleDurationMs: number;
  cycleDurationSeconds: number;
};

type AutoCombatServiceTestApi = {
  calculateAutoCombatMobTtkWithPetBonus(params: {
    characterId: string;
    mob: Record<string, unknown>;
    playerStats: FighterFixture;
  }): Promise<AutoCombatTtkFixture>;
  getPersistedAutoCombatMobTtkTiming(
    session: Record<string, unknown>,
    fallbackEstimatedKillTimeSeconds: number,
  ): AutoCombatTtkFixture;
  calculateCharacterFighterStats(character: unknown): FighterFixture;
  buildBattleProgressPayload(
    session: Record<string, unknown>,
    currentMob: Record<string, unknown>,
    now: Date,
  ): BattleProgressFixture;
};

function createServiceHarness() {
  const calculateAutoCombatTtk = jest.fn(
    (_characterId: string, baseDurationMs: number) =>
      Promise.resolve({
        durationMs: Math.ceil(baseDurationMs * 0.925),
        bonus: {
          petDefinitionId: 'pet-auto-combat-t5',
          effectBasisPoints: 750,
        },
      }),
  );
  const service = new AutoCombatService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { calculateAutoCombatTtk } as never,
  );

  return { service, calculateAutoCombatTtk };
}

describe('AutoCombatService TTK pet processing', () => {
  it('calcula o TTK efetivo com precisão em milissegundos', async () => {
    const { service, calculateAutoCombatTtk } = createServiceHarness();
    const testApi = service as unknown as AutoCombatServiceTestApi;
    const result = await testApi.calculateAutoCombatMobTtkWithPetBonus({
      characterId: 'character-1',
      mob: {
        tier: 1,
        level: 1,
        hp: 10,
        attack: 1,
        defense: 1,
        speed: 1,
      },
      playerStats: {
        name: 'Lutador',
        className: 'Lutador',
        hp: 100,
        maxHp: 100,
        attack: 20,
        defense: 10,
        speed: 10,
        precision: 5,
        technique: 5,
        agility: 5,
      },
    });
    const baseDurationMs = calculateAutoCombatTtk.mock.calls[0][1];

    expect(result.unmodifiedKillTimeMs).toBe(baseDurationMs);
    expect(result.estimatedKillTimeMs).toBe(Math.ceil(baseDurationMs * 0.925));
    expect(result.estimatedKillTimeSeconds).toBe(
      result.estimatedKillTimeMs / 1_000,
    );
    expect(result.appliedPetBonus).toEqual({
      petDefinitionId: 'pet-auto-combat-t5',
      effectBasisPoints: 750,
    });
  });

  it('reconstroi o ciclo atual usando apenas o bônus persistido no monstro', () => {
    const { service, calculateAutoCombatTtk } = createServiceHarness();
    const testApi = service as unknown as AutoCombatServiceTestApi;
    const result = testApi.getPersistedAutoCombatMobTtkTiming(
      {
        estimatedKillTimeSeconds: 15,
        estimatedKillTimeMs: 14_550,
        unmodifiedKillTimeMs: 15_000,
        appliedTtkPetDefinitionId: 'pet-auto-combat-t2',
        appliedTtkPetEffectBasisPoints: 400,
      },
      30,
    );

    expect(result).toEqual({
      estimatedKillTimeMs: 14_550,
      unmodifiedKillTimeMs: 15_000,
      estimatedKillTimeSeconds: 14.55,
      appliedPetBonus: {
        petDefinitionId: 'pet-auto-combat-t2',
        effectBasisPoints: 400,
      },
    });
    expect(calculateAutoCombatTtk).not.toHaveBeenCalled();
  });

  it('mantem a timeline existente e publica sua duração exata', () => {
    const { service, calculateAutoCombatTtk } = createServiceHarness();
    const testApi = service as unknown as AutoCombatServiceTestApi;
    jest.spyOn(testApi, 'calculateCharacterFighterStats').mockReturnValue({
      name: 'Lutador',
      className: 'Lutador',
      hp: 100,
      maxHp: 100,
      attack: 20,
      defense: 10,
      speed: 10,
      precision: 5,
      technique: 5,
      agility: 5,
    });
    const now = new Date('2026-08-26T12:00:00.000Z');
    const result = testApi.buildBattleProgressPayload(
      {
        id: 'session-1',
        currentMobId: 'mob-1',
        currentCombatIndex: 2,
        lastProcessedAt: now,
        killProgressMs: 2_500,
        estimatedKillTimeMs: 13_875,
        unmodifiedKillTimeMs: 15_000,
        estimatedKillTimeSeconds: 13.875,
        baseKillTimeSeconds: 15,
        appliedTtkPetDefinitionId: 'pet-auto-combat-t5',
        appliedTtkPetEffectBasisPoints: 750,
        character: {},
      },
      {
        id: 'mob-1',
        tier: 1,
        level: 1,
        hp: 10,
        attack: 1,
        defense: 1,
        speed: 1,
      },
      now,
    );

    expect(result).toMatchObject({
      progressSeconds: 2.5,
      cycleDurationMs: 13_875,
      cycleDurationSeconds: 13.875,
      estimatedKillTimeMs: 13_875,
      unmodifiedKillTimeMs: 15_000,
      appliedPetBonus: {
        petDefinitionId: 'pet-auto-combat-t5',
        effectBasisPoints: 750,
        effectPercent: 7.5,
      },
    });
    expect(calculateAutoCombatTtk).not.toHaveBeenCalled();
  });
});
