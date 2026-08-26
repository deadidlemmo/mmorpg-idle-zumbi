import {
  EconomyCurrency,
  PetSpecialization,
  Rarity,
  WorldBossEventStatus,
  WorldBossRewardType,
} from '@prisma/client';

type WorldBossRewardCandidate = {
  rewardType: WorldBossRewardType;
  itemId?: string | null;
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

export type SelectedWorldBossReward = {
  rewardType: WorldBossRewardType;
  itemId?: string | null;
  currency?: EconomyCurrency | null;
  quantity: number;
  rarity?: Rarity | null;
  randomPetCocoon: boolean;
};

type PetCocoonCandidate = {
  cocoonItemId: string;
  specialization: PetSpecialization;
};

const PET_COCOON_SPECIALIZATIONS = Object.freeze(
  Object.values(PetSpecialization),
);

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
