import assert from "node:assert/strict";
import test from "node:test";
import type { AutoCombatRealtimeEvent } from "../types/auto-combat.types.ts";
import {
  buildAutoCombatPresentationTimeline,
  getAutoCombatPresentationCssTimeline,
  getAutoCombatPresentationProgress,
  getAutoCombatPresentationQueueDelayMs,
  isAutoCombatPresentationTimelineEnabled,
} from "./presentation-timeline.ts";

function buildTimeline(startedAtMs = 10_000) {
  return buildAutoCombatPresentationTimeline({
    sessionId: "session-1",
    enemyInstanceId: "enemy-1",
    startedAtMs,
    durationMs: 3_000,
  });
}

function buildEvent(
  type: AutoCombatRealtimeEvent["type"],
  overrides: Partial<AutoCombatRealtimeEvent> = {},
) {
  return {
    type,
    sessionId: "session-1",
    enemyInstanceId: "enemy-1",
    ...overrides,
  } as AutoCombatRealtimeEvent;
}

test("ativa a timeline v2 somente para administrador com a flag ligada", () => {
  assert.equal(
    isAutoCombatPresentationTimelineEnabled({
      userRole: "ADMIN",
      flagValue: "true",
    }),
    true,
  );
  assert.equal(
    isAutoCombatPresentationTimelineEnabled({
      userRole: "PLAYER",
      flagValue: "true",
    }),
    false,
  );
  assert.equal(
    isAutoCombatPresentationTimelineEnabled({
      userRole: "ADMIN",
      flagValue: "false",
    }),
    false,
  );
});

test("latencia de transporte nao comprime a duracao visual local", () => {
  for (const latencyMs of [0, 250, 500, 800, 1_500]) {
    const localArrivalMs = 20_000 + latencyMs;
    const timeline = buildTimeline(localArrivalMs);

    assert.equal(
      getAutoCombatPresentationProgress({
        timeline,
        nowMs: localArrivalMs,
      })?.remainingPercent,
      100,
    );
    assert.equal(
      getAutoCombatPresentationProgress({
        timeline,
        nowMs: localArrivalMs + 1_500,
      })?.remainingPercent,
      50,
    );
    assert.equal(
      getAutoCombatPresentationProgress({
        timeline,
        nowMs: localArrivalMs + 3_000,
      })?.remainingPercent,
      0,
    );
  }
});

test("segura o hit fatal ate a barra completar", () => {
  const timeline = buildTimeline();
  const event = buildEvent("PLAYER_HIT", {
    target: "MOB",
    mobHpAfter: 0,
    targetHpAfter: 0,
  });

  assert.equal(
    getAutoCombatPresentationQueueDelayMs({
      timeline,
      event,
      nextEvent: buildEvent("MOB_DEFEATED"),
      nowMs: 11_200,
    }),
    1_800,
  );
  assert.equal(
    getAutoCombatPresentationQueueDelayMs({
      timeline,
      event,
      nextEvent: buildEvent("MOB_DEFEATED"),
      nowMs: 13_000,
    }),
    0,
  );
});

test("nao segura evento de outra instancia de monstro", () => {
  assert.equal(
    getAutoCombatPresentationQueueDelayMs({
      timeline: buildTimeline(),
      event: buildEvent("MOB_DEFEATED", {
        enemyInstanceId: "enemy-2",
      }),
      nowMs: 10_500,
    }),
    0,
  );
});

test("gera animacao CSS unica e nao repetitiva", () => {
  const cssTimeline = getAutoCombatPresentationCssTimeline({
    timeline: buildTimeline(),
    nowMs: 11_250,
  });

  assert.equal(cssTimeline?.durationSeconds, 3);
  assert.equal(cssTimeline?.elapsedSeconds, 1.25);
  assert.equal(cssTimeline?.direction, "drain");
  assert.equal(cssTimeline?.iterationCount, 1);
});
