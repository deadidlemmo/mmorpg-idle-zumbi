import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPremiumTimePresentation } from "./premium-time";

const nowMs = Date.UTC(2026, 8, 1, 12, 0, 0);

test("resume o tempo Premium usando as duas maiores unidades", () => {
  const presentation = buildPremiumTimePresentation(
    new Date(nowMs + (28 * 24 + 6) * 60 * 60 * 1_000).toISOString(),
    nowMs,
  );

  assert.equal(presentation.isActive, true);
  assert.equal(presentation.remainingLabel, "28 dias e 6 horas restantes");
  assert.ok(presentation.expirationLabel);
});

test("mantém pelo menos um minuto visível perto da expiração", () => {
  const presentation = buildPremiumTimePresentation(
    new Date(nowMs + 15_000).toISOString(),
    nowMs,
  );

  assert.equal(presentation.isActive, true);
  assert.equal(presentation.remainingLabel, "1 minuto restante");
});

test("trata prazo ausente, inválido ou vencido como Premium inativo", () => {
  for (const premiumUntil of [
    null,
    "data-inválida",
    new Date(nowMs - 1).toISOString(),
  ]) {
    assert.deepEqual(buildPremiumTimePresentation(premiumUntil, nowMs), {
      isActive: false,
      remainingLabel: "Nenhum tempo Premium ativo",
      expirationLabel: null,
    });
  }
});
