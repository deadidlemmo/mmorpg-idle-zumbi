import assert from "node:assert/strict";
import test from "node:test";
import { isAutoCombatActivityActive } from "./autoCombatActivityState";

test("encerra a barra mesmo que o ultimo mob visual continue preservado", () => {
  const isActive = isAutoCombatActivityActive({
    statusActive: true,
    hasActiveAutoCombat: null,
    sessionStatus: "FINISHED",
    sessionPhase: "MOB_DEFEATED",
    hasCombatTarget: true,
    hasSession: true,
  });

  assert.equal(isActive, false);
});

test("mantem a barra durante a apresentacao do ultimo abate ainda ativo", () => {
  const isActive = isAutoCombatActivityActive({
    statusActive: true,
    hasActiveAutoCombat: true,
    sessionStatus: "ACTIVE",
    sessionPhase: "COMBAT_ACTIVE",
    hasCombatTarget: true,
    hasSession: true,
  });

  assert.equal(isActive, true);
});

test("respeita inatividade canonica diante de alvo visual obsoleto", () => {
  const isActive = isAutoCombatActivityActive({
    statusActive: true,
    hasActiveAutoCombat: false,
    sessionStatus: "ACTIVE",
    sessionPhase: "COMBAT_ACTIVE",
    hasCombatTarget: true,
    hasSession: true,
  });

  assert.equal(isActive, false);
});

test("mantem rastreio ativo mesmo sem monstro atual", () => {
  const isActive = isAutoCombatActivityActive({
    statusActive: true,
    hasActiveAutoCombat: true,
    sessionStatus: "ACTIVE",
    sessionPhase: "HUNTING",
    hasCombatTarget: false,
    hasSession: true,
  });

  assert.equal(isActive, true);
});
