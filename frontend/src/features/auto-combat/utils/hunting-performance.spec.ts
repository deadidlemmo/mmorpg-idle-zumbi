import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHuntingPerformance,
  formatHuntingDuration,
} from "./hunting-performance";

test("combina rastreio atual e TTK projetado sem arredondar o ciclo antes da taxa", () => {
  const result = buildHuntingPerformance(15, {
    averageCombatDurationSeconds: 0.075,
    xpPerMinute: 8.5,
  });

  assert.equal(result.cycleSeconds, 15.075);
  assert.equal(result.encountersPerHour, 239);
  assert.equal(result.xpPerHour, 510);
  assert.equal(formatHuntingDuration(result.averageTtkSeconds), "0,075s");
});

test("não inventa médias quando a projeção está indisponível", () => {
  const result = buildHuntingPerformance(12, null);

  assert.equal(result.trackingSeconds, 12);
  assert.equal(result.averageTtkSeconds, null);
  assert.equal(result.encountersPerHour, null);
  assert.equal(result.xpPerHour, null);
  assert.equal(formatHuntingDuration(null), "—");
});

test("ignora números inválidos sem gerar Infinity ou valores negativos", () => {
  const result = buildHuntingPerformance(0, {
    averageCombatDurationSeconds: Number.POSITIVE_INFINITY,
    xpPerMinute: -2,
  });

  assert.equal(result.cycleSeconds, null);
  assert.equal(result.encountersPerHour, null);
  assert.equal(result.xpPerHour, null);
});
