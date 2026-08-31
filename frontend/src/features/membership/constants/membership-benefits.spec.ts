import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MEMBERSHIP_BENEFIT_LABELS,
  MEMBERSHIP_XP_BENEFIT_TOPICS,
} from "./membership-benefits";

test("separa todos os bônus de EXP Premium em tópicos explícitos", () => {
  assert.equal(MEMBERSHIP_BENEFIT_LABELS.xpBonus, "+20%");
  assert.deepEqual(
    MEMBERSHIP_XP_BENEFIT_TOPICS.map((benefit) => benefit.label),
    [
      "EXP de Personagem",
      "EXP de Rastreio",
      "EXP de Expedições",
      "EXP de Criação",
    ],
  );
});
