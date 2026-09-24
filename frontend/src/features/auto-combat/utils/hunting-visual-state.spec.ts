import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceHuntingVisualMachine,
  createHuntingVisualMachineState,
  getHuntingCycleProgressPercent,
  getHuntingVisualPhaseLabel,
} from "./hunting-visual-state";

test("calcula o ciclo visual remoto e continua entre atualizacoes", () => {
  assert.equal(
    getHuntingCycleProgressPercent({
      cycleStartedAtMs: 1_000,
      cycleEndsAtMs: 11_000,
      nowMs: 9_500,
    }),
    85,
  );
  assert.equal(
    getHuntingCycleProgressPercent({
      cycleStartedAtMs: 1_000,
      cycleEndsAtMs: 11_000,
      nowMs: 19_500,
    }),
    85,
  );
  assert.equal(
    getHuntingCycleProgressPercent({
      cycleStartedAtMs: null,
      cycleEndsAtMs: 11_000,
      nowMs: 9_500,
    }),
    null,
  );
});

test("avanca pelas etapas visuais conforme o progresso confirmado", () => {
  let state = createHuntingVisualMachineState({
    isThreatReady: false,
    nowMs: 0,
    progressPercent: 10,
  });
  assert.equal(state.phase, "walking");

  state = advanceHuntingVisualMachine(state, {
    isThreatReady: false,
    nowMs: 1_000,
    progressPercent: 70,
  });
  assert.equal(state.phase, "approaching");

  state = advanceHuntingVisualMachine(state, {
    isThreatReady: false,
    nowMs: 2_000,
    progressPercent: 88,
  });
  assert.equal(state.phase, "investigating");

  state = advanceHuntingVisualMachine(state, {
    isThreatReady: false,
    nowMs: 3_000,
    progressPercent: 99,
  });
  assert.equal(state.phase, "alert");
});

test("somente o sinal canonico do backend produz o estado encontrado", () => {
  const alertState = createHuntingVisualMachineState({
    isThreatReady: false,
    nowMs: 0,
    progressPercent: 100,
  });
  assert.equal(alertState.phase, "alert");

  const foundState = advanceHuntingVisualMachine(alertState, {
    isThreatReady: true,
    nowMs: 50,
    progressPercent: 100,
  });
  assert.equal(foundState.phase, "found");
});

test("encerra o alerta ao virar o ciclo sem mostrar o proximo alvo", () => {
  let state = createHuntingVisualMachineState({
    isThreatReady: false,
    nowMs: 0,
    progressPercent: 90,
  });
  assert.equal(state.phase, "investigating");

  state = advanceHuntingVisualMachine(state, {
    isThreatReady: false,
    nowMs: 200,
    progressPercent: 5,
  });
  assert.equal(state.phase, "continuing");

  state = advanceHuntingVisualMachine(state, {
    isThreatReady: false,
    nowMs: 750,
    progressPercent: 5,
  });
  assert.equal(state.phase, "continuing");

  state = advanceHuntingVisualMachine(state, {
    isThreatReady: false,
    nowMs: 1_500,
    progressPercent: 12,
  });
  assert.equal(state.phase, "walking");
});

test("sai de encontrado por uma retomada visual temporaria", () => {
  let state = createHuntingVisualMachineState({
    isThreatReady: true,
    nowMs: 0,
    progressPercent: 100,
  });
  state = advanceHuntingVisualMachine(state, {
    isThreatReady: false,
    nowMs: 100,
    progressPercent: 0,
  });
  assert.equal(state.phase, "continuing");
  assert.equal(getHuntingVisualPhaseLabel(state.phase), "Retomando o rastreio");
});
