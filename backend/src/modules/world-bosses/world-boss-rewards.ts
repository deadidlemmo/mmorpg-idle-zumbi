import {
  EconomyCurrency,
  PetSpecialization,
  Rarity,
  WorldBossEventStatus,
  WorldBossRewardType,
} from '@prisma/client';
import { WORLD_BOSS_FRAGMENT_ITEM_FAMILY } from '../../common/config/economy.config';

type WorldBossRewardCandidate = {
  rewardType: WorldBossRewardType;
  itemId?: string | null;
  itemName?: string | null;
  item?: {
    family?: string | null;
  } | null;
  currency?: EconomyCurrency | null;
  minQuantity: number;
  maxQuantity: number;
  chance: number;
  guaranteed: boolean;
  onlyIfDefeated: boolean;
  requiresMinParticipation: boolean;
  randomPetCocoon?: boolean;
  minContributionPercent: number;
  rarity?: Rarity | null;
};

type WorldBossRewardEvent = {
  status: WorldBossEventStatus;
  currentHp: number;
  defeatedAt?: Date | null;
};

type WorldBossRewardParticipant = {
  eligibleForReward: boolean;
  contributionPercent: number;
};

export type WorldBossDailyPetRewardState = {
  eligibleVictory: boolean;
  previousEligibleVictories: number;
  cocoonsGranted: number;
};

type WorldBossDailyPetRewardPolicy = {
  fullRewardVictoriesPerTier: number;
  maxCocoonsPerTier: number;
  subsequentCocoonChanceMultiplier: number;
  subsequentFragmentQuantity: number;
};

type WorldBossDailyXpRewardPolicy = {
  unrestrictedThroughTier: number;
  fullRewardVictoriesPerTier: number;
  secondVictoryMultiplier: number;
  subsequentVictoryMultiplier: number;
};

export type SelectedWorldBossReward = {
  rewardType: WorldBossRewardType;
  itemId?: string | null;
  currency?: EconomyCurrency | null;
  quantity: number;
  rarity?: Rarity | null;
  randomPetCocoon: boolean;
  isWorldBossFragment: boolean;
};

type PetCocoonCandidate = {
  cocoonItemId: string;
  specialization: PetSpecialization;
};

const PET_COCOON_SPECIALIZATIONS = Object.freeze(
  Object.values(PetSpecialization),
);

export function getUtcDailyResetWindow(now: Date) {
  const startsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + 1);
  return { startsAt, endsAt };
}

export function isWorldBossFragmentReward(
  reward: Pick<
    WorldBossRewardCandidate,
    'rewardType' | 'currency' | 'itemName' | 'item'
  >,
) {
  return (
    reward.rewardType === WorldBossRewardType.MATERIAL &&
    (reward.item?.family === WORLD_BOSS_FRAGMENT_ITEM_FAMILY ||
      /^Fragmento de Ameaça T(?:10|[1-9])$/.test(reward.itemName ?? ''))
  );
}

export function applyWorldBossDailyPetRewardPolicy<
  T extends WorldBossRewardCandidate,
>(
  rewards: readonly T[],
  state: WorldBossDailyPetRewardState,
  policy: WorldBossDailyPetRewardPolicy,
) {
  const receivesFullReward =
    state.eligibleVictory &&
    state.previousEligibleVictories < policy.fullRewardVictoriesPerTier;

  return rewards.flatMap((reward) => {
    const isPetFragment = isWorldBossFragmentReward(reward);
    const isPetCocoon = reward.rewardType === WorldBossRewardType.PET_EGG;

    if (!isPetFragment && !isPetCocoon) return [reward];
    if (!state.eligibleVictory) return [];

    if (isPetFragment) {
      if (receivesFullReward) return [reward];

      const quantity = Math.max(
        1,
        Math.floor(policy.subsequentFragmentQuantity),
      );
      return [
        {
          ...reward,
          minQuantity: quantity,
          maxQuantity: quantity,
          chance: 100,
          guaranteed: true,
        },
      ];
    }

    if (state.cocoonsGranted >= policy.maxCocoonsPerTier) return [];
    if (receivesFullReward) return [reward];

    return [
      {
        ...reward,
        chance: reward.chance * policy.subsequentCocoonChanceMultiplier,
      },
    ];
  });
}

export function getWorldBossDailyXpMultiplier(
  tier: number,
  previousEligibleVictories: number,
  policy: WorldBossDailyXpRewardPolicy,
) {
  if (tier <= policy.unrestrictedThroughTier) return 1;
  if (previousEligibleVictories < policy.fullRewardVictoriesPerTier) return 1;
  if (previousEligibleVictories === policy.fullRewardVictoriesPerTier) {
    return policy.secondVictoryMultiplier;
  }
  return policy.subsequentVictoryMultiplier;
}

export function applyWorldBossDailyXpRewardPolicy<
  T extends WorldBossRewardCandidate,
>(
  rewards: readonly T[],
  tier: number,
  state: Pick<
    WorldBossDailyPetRewardState,
    'eligibleVictory' | 'previousEligibleVictories'
  >,
  policy: WorldBossDailyXpRewardPolicy,
) {
  if (!state.eligibleVictory) return [...rewards];

  const multiplier = getWorldBossDailyXpMultiplier(
    tier,
    state.previousEligibleVictories,
    policy,
  );
  if (multiplier === 1) return [...rewards];

  return rewards.map((reward) => {
    if (reward.rewardType !== WorldBossRewardType.XP) return reward;

    return {
      ...reward,
      minQuantity: Math.max(1, Math.floor(reward.minQuantity * multiplier)),
      maxQuantity: Math.max(1, Math.floor(reward.maxQuantity * multiplier)),
    };
  });
}

export function wasWorldBossDefeated(event: WorldBossRewardEvent) {
  return (
    event.status === WorldBossEventStatus.DEFEATED ||
    Boolean(event.defeatedAt) ||
    event.currentHp <= 0
  );
}

export function selectWorldBossRewards(params: {
  event: WorldBossRewardEvent;
  participant: WorldBossRewardParticipant;
  rewards: WorldBossRewardCandidate[];
  collectiveMultiplier: number;
  nonDefeatedChanceMultiplier: number;
  randomPercent?: () => number;
  randomInt: (min: number, max: number) => number;
}) {
  const defeated = wasWorldBossDefeated(params.event);
  const randomPercent = params.randomPercent ?? Math.random;
  let randomPetCocoonRollConsumed = false;

  return params.rewards.reduce<SelectedWorldBossReward[]>(
    (selected, reward) => {
      if (
        reward.requiresMinParticipation &&
        !params.participant.eligibleForReward
      ) {
        return selected;
      }
      if (reward.onlyIfDefeated && !defeated) return selected;
      if (
        params.participant.contributionPercent < reward.minContributionPercent
      ) {
        return selected;
      }

      if (reward.randomPetCocoon) {
        if (randomPetCocoonRollConsumed) return selected;
        randomPetCocoonRollConsumed = true;
      }

      const chance = defeated
        ? reward.chance
        : reward.chance * params.nonDefeatedChanceMultiplier;
      if (!reward.guaranteed && randomPercent() * 100 >= chance)
        return selected;

      const appliesCollectiveMultiplier =
        reward.rewardType === WorldBossRewardType.XP ||
        reward.rewardType === WorldBossRewardType.GOLD;
      const quantity = Math.max(
        0,
        Math.floor(
          params.randomInt(reward.minQuantity, reward.maxQuantity) *
            (appliesCollectiveMultiplier ? params.collectiveMultiplier : 1),
        ),
      );
      if (quantity <= 0) return selected;

      selected.push({
        rewardType: reward.rewardType,
        itemId: reward.itemId,
        currency: reward.currency,
        quantity,
        rarity: reward.rarity,
        randomPetCocoon: reward.randomPetCocoon ?? false,
        isWorldBossFragment: isWorldBossFragmentReward(reward),
      });
      return selected;
    },
    [],
  );
}

export function selectRandomPetCocoonCandidate(
  candidates: PetCocoonCandidate[],
  randomInt: (min: number, max: number) => number,
) {
  const candidateBySpecialization = new Map<
    PetSpecialization,
    PetCocoonCandidate
  >();

  for (const candidate of candidates) {
    if (candidateBySpecialization.has(candidate.specialization)) {
      throw new Error(
        `Mais de um casulo ativo configurado para ${candidate.specialization}.`,
      );
    }
    candidateBySpecialization.set(candidate.specialization, candidate);
  }

  const orderedCandidates = PET_COCOON_SPECIALIZATIONS.map(
    (specialization) => candidateBySpecialization.get(specialization) ?? null,
  );
  if (orderedCandidates.some((candidate) => candidate === null)) {
    throw new Error(
      'O sorteio de casulos exige as oito especializações ativas no tier.',
    );
  }

  const selectedIndex = randomInt(0, orderedCandidates.length - 1);
  return orderedCandidates[selectedIndex]!;
}
