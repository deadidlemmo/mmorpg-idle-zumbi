import assert from "node:assert/strict";
import test from "node:test";

import {
  getHuntingCombatAnimationTimeScale,
  getHuntingCombatVisualStep,
  getHuntingMobDeathPresentationDuration,
  normalizeHuntingMobName,
  shouldReplaceHuntingThreat,
  shouldPresentHuntingMobDeath,
} from "./hunting-combat-visual";

test("preserva a separacao do apostrofo ao resolver o morcego", () => {
  assert.equal(
    normalizeHuntingMobName("Morcego de Caixa d’Água"),
    "morcego-de-caixa-d-agua",
  );
});

test("comprime aproximacao, troca de golpes e finalizacao em TTK subsegundo", () => {
  assert.equal(
    getHuntingCombatVisualStep({ durationMs: 800, progressPercent: 5 }).cue,
    "approach",
  );
  assert.equal(
    getHuntingCombatVisualStep({ durationMs: 800, progressPercent: 25 }).cue,
    "player-attack",
  );
  assert.equal(
    getHuntingCombatVisualStep({ durationMs: 800, progressPercent: 55 }).cue,
    "mob-attack",
  );
  assert.equal(
    getHuntingCombatVisualStep({ durationMs: 800, progressPercent: 90 }).cue,
    "finisher",
  );
  assert.equal(getHuntingCombatAnimationTimeScale(800), 1.125);
});

test("alterna golpes em batalhas longas sem alterar o resultado do combate", () => {
  const first = getHuntingCombatVisualStep({
    durationMs: 12_000,
    progressPercent: 5,
  });
  const second = getHuntingCombatVisualStep({
    durationMs: 12_000,
    progressPercent: 12,
  });

  assert.equal(first.cue, "player-attack");
  assert.equal(second.cue, "mob-attack");
  assert.notEqual(first.key, second.key);
  assert.equal(getHuntingCombatAnimationTimeScale(12_000), 1);
});

test("morte confirmada sempre prevalece sobre a etapa calculada", () => {
  assert.deepEqual(
    getHuntingCombatVisualStep({
      durationMs: 5_000,
      progressPercent: 30,
      isDefeated: true,
    }),
    { cue: "defeated", key: "defeated" },
  );
});

test("mantem a morte visivel sem atrasar a regra do combate", () => {
  assert.equal(getHuntingMobDeathPresentationDuration(false), 1_050);
  assert.equal(getHuntingMobDeathPresentationDuration(true), 450);
});

test("mantem o sprite estavel durante snapshots transitorios do mesmo combate", () => {
  assert.equal(
    shouldReplaceHuntingThreat({
      battleCycleChanged: false,
      eventType: null,
      hasThreat: true,
      isCombatActive: true,
      isFreshEvent: false,
      isThreatReady: true,
      mobChanged: true,
      wasCombatActive: true,
    }),
    false,
  );
  assert.equal(
    shouldReplaceHuntingThreat({
      battleCycleChanged: true,
      eventType: null,
      hasThreat: true,
      isCombatActive: true,
      isFreshEvent: false,
      isThreatReady: true,
      mobChanged: true,
      wasCombatActive: true,
    }),
    false,
  );
  assert.equal(
    shouldReplaceHuntingThreat({
      battleCycleChanged: true,
      eventType: "MOB_SPAWNED",
      hasThreat: true,
      isCombatActive: true,
      isFreshEvent: true,
      isThreatReady: true,
      mobChanged: true,
      wasCombatActive: true,
    }),
    true,
  );
});

test("apresenta a morte quando o evento terminal chega apos a fase mudar", () => {
  assert.equal(
    shouldPresentHuntingMobDeath({
      battleCycleChanged: false,
      eventType: null,
      isCombatActive: false,
      isFreshEvent: false,
      mobChanged: false,
      wasCombatActive: true,
    }),
    true,
  );
  assert.equal(
    shouldPresentHuntingMobDeath({
      battleCycleChanged: true,
      eventType: null,
      isCombatActive: true,
      isFreshEvent: false,
      mobChanged: true,
      wasCombatActive: true,
    }),
    false,
  );
});

test("nao apresenta morte do mob quando o jogador foi derrotado", () => {
  assert.equal(
    shouldPresentHuntingMobDeath({
      battleCycleChanged: false,
      eventType: "PLAYER_DEFEATED",
      isCombatActive: false,
      isFreshEvent: true,
      mobChanged: false,
      wasCombatActive: true,
    }),
    false,
  );
});

test("aceita morte explicita mesmo depois de o combate ter encerrado", () => {
  assert.equal(
    shouldPresentHuntingMobDeath({
      battleCycleChanged: false,
      eventType: "MOB_DEFEATED",
      isCombatActive: false,
      isFreshEvent: true,
      mobChanged: false,
      wasCombatActive: false,
    }),
    true,
  );
});

test("ignora mudanca transitoria de nome dentro do mesmo ciclo", () => {
  assert.equal(
    shouldPresentHuntingMobDeath({
      battleCycleChanged: false,
      eventType: null,
      isCombatActive: true,
      isFreshEvent: false,
      mobChanged: true,
      wasCombatActive: true,
    }),
    false,
  );
});
