import assert from "node:assert/strict";
import test from "node:test";
import { resolveHuntingXpFeedback } from "./hunting-xp-feedback";

test("nao reexibe XP existente depois de F5", () => {
  const initial = resolveHuntingXpFeedback(null, "lote-1", 120);
  assert.equal(initial.gain, 0);
  assert.equal(resolveHuntingXpFeedback(initial.baseline, "lote-1", 120).gain, 0);
});

test("exibe somente XP novo confirmado e ignora snapshot antigo", () => {
  const initial = resolveHuntingXpFeedback(null, "lote-1", 120);
  const found = resolveHuntingXpFeedback(initial.baseline, "lote-1", 128);
  assert.equal(found.gain, 8);
  const stale = resolveHuntingXpFeedback(found.baseline, "lote-1", 120);
  assert.equal(stale.gain, 0);
  assert.equal(stale.baseline.amount, 128);
});

test("troca de lote estabelece nova linha de base sem ganho fantasma", () => {
  const previous = resolveHuntingXpFeedback(null, "lote-1", 120);
  const next = resolveHuntingXpFeedback(previous.baseline, "lote-2", 5);
  assert.equal(next.gain, 0);
  assert.equal(resolveHuntingXpFeedback(next.baseline, "lote-2", 13).gain, 8);
});
