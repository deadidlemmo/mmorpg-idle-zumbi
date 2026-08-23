import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoCombatPresentationTimeline,
  getAutoCombatPresentationDurationMs,
  getAutoCombatPresentationCssTimeline,
  getAutoCombatPresentationProgress,
  getAutoCombatPresentationStartedAtMs,
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

test("mantem a timeline v2 ativa por padrão para todos os jogadores", () => {
  assert.equal(
    isAutoCombatPresentationTimelineEnabled({
      flagValue: undefined,
    }),
    true,
  );
  assert.equal(
    isAutoCombatPresentationTimelineEnabled({
      flagValue: "true",
    }),
    true,
  );
});

test("permite desativar a timeline v2 como rollback explícito", () => {
  assert.equal(
    isAutoCombatPresentationTimelineEnabled({
      flagValue: "false",
    }),
    false,
  );
  assert.equal(
    isAutoCombatPresentationTimelineEnabled({ flagValue: false }),
    false,
  );
});

test("latencia de transporte posiciona a barra no relogio absoluto", () => {
  for (const latencyMs of [0, 250, 500, 800, 1_500]) {
    const localArrivalMs = 5_000 + latencyMs;
    const startedAtMs = getAutoCombatPresentationStartedAtMs({
      monotonicNowMs: localArrivalMs,
      wallClockNowMs: 20_000 + latencyMs,
      visualCycleStartedAtMs: 20_000,
    });
    const timeline = buildTimeline(startedAtMs ?? localArrivalMs);

    assert.ok(
      Math.abs(
        (getAutoCombatPresentationProgress({
          timeline,
          nowMs: localArrivalMs,
        })?.remainingPercent ?? 0) -
          (100 - (latencyMs / 3_000) * 100),
      ) < 0.001,
    );
    assert.equal(
      getAutoCombatPresentationProgress({
        timeline,
        nowMs: localArrivalMs + (3_000 - latencyMs),
      })?.remainingPercent,
      0,
    );
  }
});

test("preserva a duracao exata informada pelo backend", () => {
  assert.equal(
    getAutoCombatPresentationDurationMs({ cycleDurationMs: 1_250.4 }),
    1_251,
  );
});

test("preserva a ancora visual ao retornar de uma aba oculta", () => {
  const initialStartedAtMs = getAutoCombatPresentationStartedAtMs({
    monotonicNowMs: 5_000,
    wallClockNowMs: 100_000,
    visualCycleStartedAtMs: 98_750,
  });
  const resumedStartedAtMs = getAutoCombatPresentationStartedAtMs({
    monotonicNowMs: 65_000,
    wallClockNowMs: 160_000,
    visualCycleStartedAtMs: 98_750,
  });

  assert.equal(initialStartedAtMs, 3_750);
  assert.equal(resumedStartedAtMs, 3_750);
});

test("inicia no relogio monotono quando ainda nao existe ancora visual", () => {
  assert.equal(
    getAutoCombatPresentationStartedAtMs({
      monotonicNowMs: 7_500,
      wallClockNowMs: 100_000,
      visualCycleStartedAtMs: null,
    }),
    7_500,
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
