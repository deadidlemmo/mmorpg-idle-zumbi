import assert from "node:assert/strict";
import test from "node:test";
import {
  getCombatClassKey,
  getCombatClassLungeDistance,
  getSurvivorAnimationFrameCount,
  getSurvivorCombatAnimationKey,
  isSurvivorCombatAnimationKey,
} from "./characterCombatClass";

test("reconhece as quatro classes mesmo com acentos e espacos", () => {
  assert.equal(getCombatClassKey(" Lutador "), "lutador");
  assert.equal(getCombatClassKey("Atirador"), "atirador");
  assert.equal(getCombatClassKey("Médico"), "medico");
  assert.equal(getCombatClassKey("medico"), "medico");
  assert.equal(getCombatClassKey("Assassino"), "assassino");
  assert.equal(getCombatClassKey("classe desconhecida"), null);
});

test("o atirador nao avanca sobre o alvo durante o disparo", () => {
  assert.equal(getCombatClassLungeDistance("Atirador"), 0);
  assert.equal(getCombatClassLungeDistance("Médico"), 10);
  assert.equal(getCombatClassLungeDistance("Assassino"), 18);
  assert.equal(getCombatClassLungeDistance("Lutador"), 20);
});

test("usa oito quadros de caminhada e ataque apenas nas classes jogaveis", () => {
  for (const className of ["Lutador", "Atirador", "Médico", "Assassino"]) {
    assert.equal(getSurvivorAnimationFrameCount("walk", className), 8);
    assert.equal(getSurvivorAnimationFrameCount("attack", className), 8);
    assert.equal(getSurvivorAnimationFrameCount("hurt", className), 2);
    assert.equal(getSurvivorAnimationFrameCount("death", className), 6);
  }
  assert.equal(getSurvivorAnimationFrameCount("walk", null), 4);
  assert.equal(getSurvivorAnimationFrameCount("attack", "desconhecida"), 4);
});

test("a animacao de combate por classe permanece reconhecivel durante os frames remotos", () => {
  for (const animation of ["attack", "hurt", "death"] as const) {
    const classKey = getSurvivorCombatAnimationKey(animation, "left", "Assassino");
    const legacyKey = getSurvivorCombatAnimationKey(animation, "left");
    assert.equal(isSurvivorCombatAnimationKey(classKey), true);
    assert.equal(isSurvivorCombatAnimationKey(legacyKey), true);
  }
  assert.equal(isSurvivorCombatAnimationKey("suburbio-survivor-walk-assassino-left"), false);
});
