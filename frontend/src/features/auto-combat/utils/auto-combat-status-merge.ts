import type { AutoCombatStatusResponse } from "../types/auto-combat.types";

function mergeStatusObject<T extends object>(
  baseline: T | null | undefined,
  incoming: T | null | undefined,
): T | null | undefined {
  if (incoming === null) return null;
  if (!incoming) return baseline;

  return {
    ...(baseline ?? {}),
    ...incoming,
  } as T;
}

export function mergeAutoCombatStatusDetails(
  restStatus: AutoCombatStatusResponse,
  realtimeStatus: AutoCombatStatusResponse,
): AutoCombatStatusResponse {
  const session = mergeStatusObject(restStatus.session, realtimeStatus.session);
  const currentMob = mergeStatusObject(
    restStatus.currentMob,
    realtimeStatus.currentMob,
  );
  const selectedEncounter = mergeStatusObject(
    restStatus.selectedEncounter,
    realtimeStatus.selectedEncounter,
  );
  const hunting = mergeStatusObject(restStatus.hunting, realtimeStatus.hunting);
  const huntBatch = mergeStatusObject(
    restStatus.huntBatch,
    realtimeStatus.huntBatch,
  );

  if (session && realtimeStatus.session) {
    session.battleProgress = mergeStatusObject(
      restStatus.session?.battleProgress,
      realtimeStatus.session.battleProgress,
    );
    session.battleSelection = mergeStatusObject(
      restStatus.session?.battleSelection,
      realtimeStatus.session.battleSelection,
    );
  }

  if (currentMob && realtimeStatus.currentMob) {
    currentMob.battleProgress = mergeStatusObject(
      restStatus.currentMob?.battleProgress,
      realtimeStatus.currentMob.battleProgress,
    );
  }

  if (selectedEncounter && realtimeStatus.selectedEncounter) {
    selectedEncounter.mob = mergeStatusObject(
      restStatus.selectedEncounter?.mob,
      realtimeStatus.selectedEncounter.mob,
    );
  }

  if (hunting) {
    hunting.trackedMonsters =
      realtimeStatus.trackedMonsters ??
      realtimeStatus.hunting?.trackedMonsters ??
      restStatus.hunting?.trackedMonsters;
    if (realtimeStatus.hunting) {
      hunting.skill = mergeStatusObject(
        restStatus.hunting?.skill,
        realtimeStatus.hunting.skill,
      );
    }
  }

  if (huntBatch) {
    huntBatch.mobs =
      realtimeStatus.trackedMonsters ??
      realtimeStatus.huntBatch?.mobs ??
      restStatus.huntBatch?.mobs;
  }

  const rewards = realtimeStatus.rewards
    ? {
        ...restStatus.rewards,
        ...realtimeStatus.rewards,
        loots:
          realtimeStatus.rewards.loots ?? restStatus.rewards?.loots ?? [],
        mobs: realtimeStatus.rewards.mobs ?? restStatus.rewards?.mobs ?? [],
        trackedMonsters:
          realtimeStatus.trackedMonsters ??
          realtimeStatus.rewards.trackedMonsters ??
          restStatus.rewards?.trackedMonsters,
      }
    : restStatus.rewards;

  return {
    ...restStatus,
    ...realtimeStatus,
    character:
      mergeStatusObject(restStatus.character, realtimeStatus.character) ??
      undefined,
    session,
    currentMob,
    battleProgress: mergeStatusObject(
      restStatus.battleProgress,
      realtimeStatus.battleProgress,
    ),
    battleSelection: mergeStatusObject(
      restStatus.battleSelection,
      realtimeStatus.battleSelection,
    ),
    selectedEncounter,
    trackedMonsters:
      realtimeStatus.trackedMonsters ?? restStatus.trackedMonsters,
    huntingSkill: mergeStatusObject(
      restStatus.huntingSkill,
      realtimeStatus.huntingSkill,
    ),
    hunting,
    huntBatch,
    subMap: mergeStatusObject(restStatus.subMap, realtimeStatus.subMap),
    map: mergeStatusObject(restStatus.map, realtimeStatus.map),
    rewards,
    sessionSummary:
      mergeStatusObject(
        restStatus.sessionSummary,
        realtimeStatus.sessionSummary,
      ) ?? undefined,
  };
}
