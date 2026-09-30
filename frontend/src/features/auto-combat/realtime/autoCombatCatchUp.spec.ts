import assert from "node:assert/strict";
import test from "node:test";
import type {
  AutoCombatRealtimeEvent,
  AutoCombatStatusResponse,
} from "../types/auto-combat.types.ts";
import {
  isHistoricalAutoCombatEvent,
  isHistoricalAutoCombatStatus,
} from "./autoCombatCatchUp.ts";

const serverNow = "2026-09-30T12:00:00.000Z";

function activeStatus(
  phase: string,
  cycleEndsAt: string,
): AutoCombatStatusResponse {
  return {
    active: true,
    serverNow,
    session: {
      id: "session-1",
      status: "ACTIVE",
      phase,
      startedAt: "2026-09-30T11:00:00.000Z",
    },
    hunting: { nextFindAt: cycleEndsAt },
    battleProgress: { cycleEndsAt },
  };
}

test("nao apresenta ciclos antigos de rastreio ou combate no retorno idle", () => {
  assert.equal(
    isHistoricalAutoCombatStatus(
      activeStatus("HUNTING", "2026-09-30T11:55:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isHistoricalAutoCombatStatus(
      activeStatus("COMBAT_ACTIVE", "2026-09-30T11:59:00.000Z"),
    ),
    true,
  );
});

test("aceita somente o ciclo atual e nao bloqueia o status terminal", () => {
  assert.equal(
    isHistoricalAutoCombatStatus(
      activeStatus("COMBAT_ACTIVE", "2026-09-30T12:00:20.000Z"),
    ),
    false,
  );
  assert.equal(
    isHistoricalAutoCombatStatus({
      ...activeStatus("HUNTING", "2026-09-30T11:55:00.000Z"),
      session: {
        ...activeStatus("HUNTING", "2026-09-30T11:55:00.000Z").session!,
        status: "FINISHED",
      },
    }),
    false,
  );
});

test("ignora spawn e abate historicos sem rejeitar o mob atual", () => {
  const spawn: AutoCombatRealtimeEvent = {
    type: "MOB_SPAWNED",
    serverTime: serverNow,
    actionStartedAt: "2026-09-30T11:59:00.000Z",
    estimatedKillTimeMs: 10_000,
  };
  assert.equal(isHistoricalAutoCombatEvent(spawn), true);
  assert.equal(
    isHistoricalAutoCombatEvent({
      ...spawn,
      actionStartedAt: "2026-09-30T11:59:50.000Z",
      estimatedKillTimeMs: 35_000,
    }),
    false,
  );
  assert.equal(
    isHistoricalAutoCombatEvent({
      type: "MOB_DEFEATED",
      serverTime: serverNow,
      nextActionAt: "2026-09-30T11:58:00.000Z",
    }),
    true,
  );
  assert.equal(
    isHistoricalAutoCombatEvent({
      type: "HUNT_TARGET_FOUND",
      serverTime: "2026-09-30T11:58:00.000Z",
      actionStartedAt: "2026-09-30T11:58:00.000Z",
    }, new Date(serverNow).getTime()),
    true,
  );
});
