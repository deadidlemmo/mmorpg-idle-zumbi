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
  getPetRarityByTier,
  isEconomyLaunchTier,
} from '../../common/config/economy.config';
import {
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
            reward.rewardType === WorldBossRewardType.CURRENCY &&
            reward.currency === EconomyCurrency.WORLD_BOSS_FRAGMENT,
        );
        expect(fragment).toMatchObject({
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

  it('mantem a curva calibrada de casulos e fragmentos T1-T5', () => {
    expect(ECONOMY_ACTIVITY_REWARDS.worldBossCocoonChancePercent).toEqual({
      1: 7,
      2: 7,
      3: 5,
      4: 5,
      5: 4,
    });
    expect(ECONOMY_ACTIVITY_REWARDS.worldBossFragments).toEqual({
      1: { min: 1, max: 1 },
      2: { min: 1, max: 1 },
      3: { min: 1, max: 2 },
      4: { min: 1, max: 2 },
      5: { min: 1, max: 2 },
    });
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
          rewardType: WorldBossRewardType.CURRENCY,
          currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
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
        rewardType: WorldBossRewardType.CURRENCY,
        currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
        quantity: 5,
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
          rewardType: WorldBossRewardType.CURRENCY,
          currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
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
        rewardType: WorldBossRewardType.CURRENCY,
        quantity: 2,
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
          rewardType: WorldBossRewardType.CURRENCY,
          currency: EconomyCurrency.WORLD_BOSS_FRAGMENT,
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
