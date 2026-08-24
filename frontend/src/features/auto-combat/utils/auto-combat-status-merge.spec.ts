import assert from "node:assert/strict";
import test from "node:test";
import type { AutoCombatStatusResponse } from "../types/auto-combat.types";
import { mergeAutoCombatStatusDetails } from "./auto-combat-status-merge";

function buildRestStatus(): AutoCombatStatusResponse {
  return {
    active: true,
    phase: "COMBAT_ACTIVE",
    session: {
      id: "session-1",
      status: "ACTIVE",
      startedAt: "2026-08-24T12:00:00.000Z",
      phase: "COMBAT_ACTIVE",
    },
    currentMob: {
      id: "mob-1",
      name: "Síndico Devorado",
      level: 10,
      tier: 1,
      currentHp: 206,
      maxHp: 206,
      imageUrl: "/assets/sindico.webp",
    },
    trackedMonsters: [
      {
        mobId: "mob-1",
        mobName: "Síndico Devorado",
        mobLevel: 10,
        mobTier: 1,
        foundCount: 200,
        remainingCount: 200,
        mob: {
          id: "mob-1",
          name: "Síndico Devorado",
          level: 10,
          tier: 1,
          currentHp: 206,
          maxHp: 206,
          imageUrl: "/assets/sindico.webp",
        },
      },
    ],
    huntBatch: {
      id: "batch-1",
      mobs: [],
    },
    rewards: {
      loots: [],
      mobs: [
        {
          mobId: "mob-1",
          mobName: "Síndico Devorado",
          mobLevel: 10,
          mobTier: 1,
          kills: 0,
          xpGained: 0,
        },
      ],
    },
  };
}

test("mescla o snapshot compacto sem perder detalhes visuais do REST", () => {
  const rest = buildRestStatus();
  const compact: AutoCombatStatusResponse = {
    active: true,
    phase: "COMBAT_ACTIVE",
    session: {
      id: "session-1",
      status: "ACTIVE",
      startedAt: "2026-08-24T12:00:00.000Z",
      phase: "COMBAT_ACTIVE",
      totalKills: 1,
    },
    currentMob: {
      id: "mob-1",
      name: "Síndico Devorado",
      level: 10,
      tier: 1,
      currentHp: 180,
      maxHp: 206,
    },
    battleProgress: {
      activityInstanceId: "session-1",
      cycleEndsAt: "2026-08-24T12:00:03.000Z",
      serverNow: "2026-08-24T12:00:01.000Z",
    },
    trackedMonsters: [
      {
        mobId: "mob-1",
        mobName: "Síndico Devorado",
        mobLevel: 10,
        mobTier: 1,
        foundCount: 200,
        remainingCount: 199,
      },
    ],
  };

  const merged = mergeAutoCombatStatusDetails(rest, compact);

  assert.equal(merged.currentMob?.currentHp, 180);
  assert.equal(merged.currentMob?.imageUrl, "/assets/sindico.webp");
  assert.equal(merged.battleProgress?.cycleEndsAt, compact.battleProgress?.cycleEndsAt);
  assert.equal(merged.huntBatch?.mobs?.[0]?.remainingCount, 199);
  assert.equal(merged.rewards?.mobs[0]?.mobName, "Síndico Devorado");
});

test("respeita null canonico e remove o monstro encerrado", () => {
  const merged = mergeAutoCombatStatusDetails(buildRestStatus(), {
    active: true,
    phase: "ENCOUNTER_READY",
    currentMob: null,
    battleProgress: null,
  });

  assert.equal(merged.currentMob, null);
  assert.equal(merged.battleProgress, null);
});
