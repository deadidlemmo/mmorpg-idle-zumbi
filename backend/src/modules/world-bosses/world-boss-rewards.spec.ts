import {
  EconomyCurrency,
  PetSpecialization,
  Rarity,
  WorldBossEventStatus,
  WorldBossRewardType,
} from '@prisma/client';
import { worldBossDefinitions } from '../../../prisma/seed-data/world-bosses.seed-data';
import {
  ECONOMY_ACTIVITY_REWARDS,
  ECONOMY_LAUNCH_TIERS,
  getPetBossAvailabilityProjection,
  getPetRarityByTier,
  isEconomyLaunchTier,
  PET_BOSS_AVAILABILITY_TARGET,
  PET_BOSS_DAILY_REWARD_POLICY,
  WORLD_BOSS_DAILY_XP_REWARD_POLICY,
} from '../../common/config/economy.config';
import {
  applyWorldBossDailyXpRewardPolicy,
  applyWorldBossDailyPetRewardPolicy,
  getWorldBossDailyXpMultiplier,
  getUtcDailyResetWindow,
  selectRandomPetCocoonCandidate,
  selectWorldBossRewards,
} from './world-boss-rewards';

describe('world boss reward contract', () => {
  it('configura os dois bosses de cada tier jogavel com fragmento garantido e casulo do mesmo tier', () => {
    const launchBosses = worldBossDefinitions.filter((boss) =>
      isEconomyLaunchTier(boss.tier),
    );

    expect(launchBosses).toHaveLength(ECONOMY_LAUNCH_TIERS.length * 2);

    for (const tier of ECONOMY_LAUNCH_TIERS) {
      const bosses = launchBosses.filter((boss) => boss.tier === tier);
      expect(bosses).toHaveLength(2);

      for (const boss of bosses) {
        const fragment = boss.lootTable.find(
          (reward) =>
            reward.rewardType === WorldBossRewardType.MATERIAL &&
            reward.itemName === `Fragmento de Ameaça T${tier}`,
        );
        expect(fragment).toMatchObject({
          rewardType: WorldBossRewardType.MATERIAL,
          itemName: `Fragmento de Ameaça T${tier}`,
          minQuantity: ECONOMY_ACTIVITY_REWARDS.worldBossFragments[tier].min,
          maxQuantity: ECONOMY_ACTIVITY_REWARDS.worldBossFragments[tier].max,
          chance: 100,
          guaranteed: true,
          requiresMinParticipation: true,
        });

        const cocoon = boss.lootTable.find(
          (reward) => reward.rewardType === WorldBossRewardType.PET_EGG,
        );
        expect(cocoon).toMatchObject({
          randomPetCocoon: true,
          minQuantity: 1,
          maxQuantity: 1,
          chance: ECONOMY_ACTIVITY_REWARDS.worldBossCocoonChancePercent[tier],
          guaranteed: false,
          onlyIfDefeated: true,
          requiresMinParticipation: true,
          rarity: Rarity[getPetRarityByTier(tier)],
        });
      }
    }
  });

  it('usa fragmentos físicos do próprio tier nos 20 bosses T1-T10', () => {
    expect(worldBossDefinitions).toHaveLength(20);

    for (const boss of worldBossDefinitions) {
      expect(
        boss.lootTable.find(
          (reward) =>
            reward.rewardType === WorldBossRewardType.MATERIAL &&
            reward.itemName === `Fragmento de Ameaça T${boss.tier}`,
        ),
      ).toBeDefined();
      expect(
        boss.lootTable.some(
          (reward) =>
            reward.rewardType === WorldBossRewardType.CURRENCY &&
            reward.currency === EconomyCurrency.WORLD_BOSS_FRAGMENT,
        ),
      ).toBe(false);
    }
  });

  it('mantem a curva calibrada de casulos e fragmentos T1-T5', () => {
    expect(ECONOMY_ACTIVITY_REWARDS.worldBossCocoonChancePercent).toEqual({
      1: 18,
      2: 16,
      3: 14,
      4: 12,
      5: 10,
    });
    expect(ECONOMY_ACTIVITY_REWARDS.worldBossFragments).toEqual({
      1: { min: 2, max: 3 },
      2: { min: 3, max: 4 },
      3: { min: 4, max: 5 },
      4: { min: 5, max: 6 },
      5: { min: 6, max: 7 },
    });
  });

  it('mantem o primeiro pet acessivel sem transformar casulo em recompensa garantida', () => {
    const projections = ECONOMY_LAUNCH_TIERS.map((tier) =>
      getPetBossAvailabilityProjection(tier),
    );

    expect(projections.every(Boolean)).toBe(true);
    expect(
      projections.every(
        (projection) =>
          projection!.medianCalendarDays <=
            PET_BOSS_AVAILABILITY_TARGET.maxMedianCalendarDays &&
          projection!.p90CalendarDays <=
            PET_BOSS_AVAILABILITY_TARGET.maxP90CalendarDays &&
          projection!.guaranteedFragmentVictories <=
            PET_BOSS_AVAILABILITY_TARGET.maxVictoriesForGuaranteedFragments,
      ),
    ).toBe(true);
    expect(
      projections.every(
        (projection) =>
          projection!.chancePercent > 0 && projection!.chancePercent < 100,
      ),
    ).toBe(true);
  });

  it('entrega fragmento e permite casulo ao participante elegivel quando o chefe foi derrotado', () => {
    const selected = selectWorldBossRewards({
      event: {
        status: WorldBossEventStatus.DEFEATED,
        currentHp: 0,
        defeatedAt: new Date('2026-08-25T12:00:00.000Z'),
      },
      participant: { eligibleForReward: true, contributionPercent: 10 },
      rewards: [
        {
          rewardType: WorldBossRewardType.MATERIAL,
          itemId: 'fragment-t1',
          item: { family: 'Material de Ameaça Global' },
          minQuantity: 2,
          maxQuantity: 5,
          chance: 100,
          guaranteed: true,
          onlyIfDefeated: false,
          requiresMinParticipation: true,
          minContributionPercent: 0,
          rarity: Rarity.UNCOMMON,
        },
        {
          rewardType: WorldBossRewardType.PET_EGG,
          randomPetCocoon: true,
          minQuantity: 1,
          maxQuantity: 1,
          chance: 1,
          guaranteed: false,
          onlyIfDefeated: true,
          requiresMinParticipation: true,
          minContributionPercent: 0.25,
          rarity: Rarity.LEGENDARY,
        },
      ],
      collectiveMultiplier: 1,
      nonDefeatedChanceMultiplier: 0.55,
      randomPercent: () => 0,
      randomInt: (_min, max) => max,
    });

    expect(selected).toEqual([
      expect.objectContaining({
        rewardType: WorldBossRewardType.MATERIAL,
        itemId: 'fragment-t1',
        quantity: 5,
        isWorldBossFragment: true,
      }),
      expect.objectContaining({
        rewardType: WorldBossRewardType.PET_EGG,
        randomPetCocoon: true,
        quantity: 1,
      }),
    ]);
  });

  it('mantem o fragmento garantido, mas bloqueia o casulo quando o chefe expira', () => {
    const selected = selectWorldBossRewards({
      event: {
        status: WorldBossEventStatus.EXPIRED,
        currentHp: 50,
        defeatedAt: null,
      },
      participant: { eligibleForReward: true, contributionPercent: 100 },
      rewards: [
        {
          rewardType: WorldBossRewardType.MATERIAL,
          itemId: 'fragment-t1',
          item: { family: 'Material de Ameaça Global' },
          minQuantity: 2,
          maxQuantity: 2,
          chance: 100,
          guaranteed: true,
          onlyIfDefeated: false,
          requiresMinParticipation: true,
          minContributionPercent: 0,
        },
        {
          rewardType: WorldBossRewardType.PET_EGG,
          itemId: 'cocoon-t1',
          minQuantity: 1,
          maxQuantity: 1,
          chance: 100,
          guaranteed: false,
          onlyIfDefeated: true,
          requiresMinParticipation: true,
          minContributionPercent: 0,
        },
      ],
      collectiveMultiplier: 0.5,
      nonDefeatedChanceMultiplier: 0.55,
      randomPercent: () => 0,
      randomInt: (min) => min,
    });

    expect(selected).toEqual([
      expect.objectContaining({
        rewardType: WorldBossRewardType.MATERIAL,
        quantity: 2,
        isWorldBossFragment: true,
      }),
    ]);
  });

  it('nao entrega recompensas protegidas sem participacao minima', () => {
    const selected = selectWorldBossRewards({
      event: {
        status: WorldBossEventStatus.DEFEATED,
        currentHp: 0,
      },
      participant: { eligibleForReward: false, contributionPercent: 100 },
      rewards: [
        {
          rewardType: WorldBossRewardType.MATERIAL,
          itemId: 'fragment-t1',
          item: { family: 'Material de Ameaça Global' },
          minQuantity: 2,
          maxQuantity: 5,
          chance: 100,
          guaranteed: true,
          onlyIfDefeated: false,
          requiresMinParticipation: true,
          minContributionPercent: 0,
        },
      ],
      collectiveMultiplier: 1,
      nonDefeatedChanceMultiplier: 0.55,
      randomPercent: () => 0,
      randomInt: (min) => min,
    });

    expect(selected).toEqual([]);
  });
});

describe('world boss daily pet reward policy', () => {
  const petRewards = [
    {
      rewardType: WorldBossRewardType.GOLD,
      minQuantity: 100,
      maxQuantity: 100,
      chance: 100,
      guaranteed: true,
      onlyIfDefeated: false,
      requiresMinParticipation: true,
      minContributionPercent: 0,
    },
    {
      rewardType: WorldBossRewardType.MATERIAL,
      itemId: 'fragment-t1',
      item: { family: 'Material de Ameaça Global' },
      minQuantity: 2,
      maxQuantity: 3,
      chance: 100,
      guaranteed: true,
      onlyIfDefeated: false,
      requiresMinParticipation: true,
      minContributionPercent: 0,
    },
    {
      rewardType: WorldBossRewardType.PET_EGG,
      randomPetCocoon: true,
      minQuantity: 1,
      maxQuantity: 1,
      chance: 18,
      guaranteed: false,
      onlyIfDefeated: true,
      requiresMinParticipation: true,
      minContributionPercent: 0.25,
    },
  ];

  it('mantem o lote cheio de fragmentos e a chance cheia na primeira vitoria elegivel', () => {
    const rewards = applyWorldBossDailyPetRewardPolicy(
      petRewards,
      {
        eligibleVictory: true,
        previousEligibleVictories: 0,
        cocoonsGranted: 0,
      },
      PET_BOSS_DAILY_REWARD_POLICY,
    );

    expect(rewards).toEqual(petRewards);
  });

  it('não trata saldo legado como fragmento físico', () => {
    const [reward] = applyWorldBossDailyPetRewardPolicy(
      [
        {
          rewardType: WorldBossRewardType.CURRENCY,
          currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
          minQuantity: 2,
          maxQuantity: 3,
          chance: 100,
          guaranteed: true,
          onlyIfDefeated: false,
          requiresMinParticipation: true,
          minContributionPercent: 0,
        },
      ],
      {
        eligibleVictory: true,
        previousEligibleVictories: 1,
        cocoonsGranted: 0,
      },
      PET_BOSS_DAILY_REWARD_POLICY,
    );

    expect(reward).toMatchObject({
      minQuantity: 2,
      maxQuantity: 3,
      guaranteed: true,
    });
  });

  it('entrega um fragmento e usa um por cento da chance-base nas vitorias seguintes', () => {
    const rewards = applyWorldBossDailyPetRewardPolicy(
      petRewards,
      {
        eligibleVictory: true,
        previousEligibleVictories: 1,
        cocoonsGranted: 0,
      },
      PET_BOSS_DAILY_REWARD_POLICY,
    );

    expect(
      rewards.find(
        (reward) => reward.rewardType === WorldBossRewardType.MATERIAL,
      ),
    ).toMatchObject({
      minQuantity: 1,
      maxQuantity: 1,
      chance: 100,
      guaranteed: true,
    });
    expect(
      rewards.find(
        (reward) => reward.rewardType === WorldBossRewardType.PET_EGG,
      )?.chance,
    ).toBeCloseTo(0.18, 8);
    expect(
      rewards.find((reward) => reward.rewardType === WorldBossRewardType.GOLD),
    ).toBeDefined();
  });

  it('bloqueia novas rolagens de casulo no tier depois do primeiro do dia', () => {
    const rewards = applyWorldBossDailyPetRewardPolicy(
      petRewards,
      {
        eligibleVictory: true,
        previousEligibleVictories: 2,
        cocoonsGranted: 1,
      },
      PET_BOSS_DAILY_REWARD_POLICY,
    );

    expect(
      rewards.some(
        (reward) => reward.rewardType === WorldBossRewardType.PET_EGG,
      ),
    ).toBe(false);
    expect(
      rewards.find(
        (reward) => reward.rewardType === WorldBossRewardType.MATERIAL,
      ),
    ).toMatchObject({ minQuantity: 1, maxQuantity: 1 });
    expect(
      rewards.some((reward) => reward.rewardType === WorldBossRewardType.GOLD),
    ).toBe(true);
  });

  it('nao concede insumos de pet quando o boss nao foi vencido', () => {
    const rewards = applyWorldBossDailyPetRewardPolicy(
      petRewards,
      {
        eligibleVictory: false,
        previousEligibleVictories: 0,
        cocoonsGranted: 0,
      },
      PET_BOSS_DAILY_REWARD_POLICY,
    );

    expect(rewards).toHaveLength(1);
    expect(rewards[0]?.rewardType).toBe(WorldBossRewardType.GOLD);
  });

  it('usa a mesma virada UTC das missoes diarias', () => {
    expect(
      getUtcDailyResetWindow(new Date('2026-08-30T23:59:59.999Z')),
    ).toEqual({
      startsAt: new Date('2026-08-30T00:00:00.000Z'),
      endsAt: new Date('2026-08-31T00:00:00.000Z'),
    });
  });
});

describe('world boss daily XP reward policy', () => {
  const rewards = [
    {
      rewardType: WorldBossRewardType.XP,
      minQuantity: 1_001,
      maxQuantity: 1_999,
      chance: 100,
      guaranteed: true,
      onlyIfDefeated: false,
      requiresMinParticipation: true,
      minContributionPercent: 0,
    },
    {
      rewardType: WorldBossRewardType.GOLD,
      minQuantity: 300,
      maxQuantity: 600,
      chance: 100,
      guaranteed: true,
      onlyIfDefeated: false,
      requiresMinParticipation: true,
      minContributionPercent: 0,
    },
  ];

  it('mantem XP integral em todas as vitorias T1', () => {
    expect(
      getWorldBossDailyXpMultiplier(1, 99, WORLD_BOSS_DAILY_XP_REWARD_POLICY),
    ).toBe(1);
    expect(
      applyWorldBossDailyXpRewardPolicy(
        rewards,
        1,
        { eligibleVictory: true, previousEligibleVictories: 99 },
        WORLD_BOSS_DAILY_XP_REWARD_POLICY,
      ),
    ).toEqual(rewards);
  });

  it('aplica 100%, 50% e 25% nas vitorias T2-T5', () => {
    expect(
      [0, 1, 2, 8].map((previousEligibleVictories) =>
        getWorldBossDailyXpMultiplier(
          4,
          previousEligibleVictories,
          WORLD_BOSS_DAILY_XP_REWARD_POLICY,
        ),
      ),
    ).toEqual([1, 0.5, 0.25, 0.25]);

    const secondVictory = applyWorldBossDailyXpRewardPolicy(
      rewards,
      4,
      { eligibleVictory: true, previousEligibleVictories: 1 },
      WORLD_BOSS_DAILY_XP_REWARD_POLICY,
    );
    const laterVictory = applyWorldBossDailyXpRewardPolicy(
      rewards,
      4,
      { eligibleVictory: true, previousEligibleVictories: 2 },
      WORLD_BOSS_DAILY_XP_REWARD_POLICY,
    );

    expect(secondVictory[0]).toMatchObject({
      minQuantity: 500,
      maxQuantity: 999,
    });
    expect(laterVictory[0]).toMatchObject({
      minQuantity: 250,
      maxQuantity: 499,
    });
  });

  it('nao altera Gold nem consome a faixa diaria sem vitoria elegivel', () => {
    const reduced = applyWorldBossDailyXpRewardPolicy(
      rewards,
      5,
      { eligibleVictory: true, previousEligibleVictories: 3 },
      WORLD_BOSS_DAILY_XP_REWARD_POLICY,
    );
    const failed = applyWorldBossDailyXpRewardPolicy(
      rewards,
      5,
      { eligibleVictory: false, previousEligibleVictories: 3 },
      WORLD_BOSS_DAILY_XP_REWARD_POLICY,
    );

    expect(reduced[1]).toEqual(rewards[1]);
    expect(failed).toEqual(rewards);
  });
});

describe('world boss pet cocoon protection', () => {
  const cocoonReward = {
    rewardType: WorldBossRewardType.PET_EGG,
    randomPetCocoon: true,
    minQuantity: 1,
    maxQuantity: 1,
    chance: 100,
    guaranteed: false,
    onlyIfDefeated: true,
    requiresMinParticipation: true,
    minContributionPercent: 0,
    rarity: Rarity.LEGENDARY,
  };

  it('faz no máximo uma rolagem de casulo por liquidação', () => {
    const randomPercent = jest.fn().mockReturnValue(0);
    const selected = selectWorldBossRewards({
      event: {
        status: WorldBossEventStatus.DEFEATED,
        currentHp: 0,
      },
      participant: { eligibleForReward: true, contributionPercent: 100 },
      rewards: [cocoonReward, cocoonReward],
      collectiveMultiplier: 1,
      nonDefeatedChanceMultiplier: 0.55,
      randomPercent,
      randomInt: (min) => min,
    });

    expect(selected).toHaveLength(1);
    expect(randomPercent).toHaveBeenCalledTimes(1);
  });

  it('sorteia de forma indexada entre as oito especializações', () => {
    const candidates = Object.values(PetSpecialization).map(
      (specialization, index) => ({
        specialization,
        cocoonItemId: `cocoon-${index}`,
      }),
    );

    expect(
      selectRandomPetCocoonCandidate(candidates, (_min, max) => max),
    ).toEqual(candidates.at(-1));
  });

  it('recusa um tier sem as oito especializações configuradas', () => {
    expect(() =>
      selectRandomPetCocoonCandidate(
        [
          {
            specialization: PetSpecialization.GATHERING_DESMANCHE,
            cocoonItemId: 'only-cocoon',
          },
        ],
        () => 0,
      ),
    ).toThrow('oito especializações');
  });
});
