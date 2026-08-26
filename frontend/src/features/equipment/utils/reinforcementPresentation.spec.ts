import assert from "node:assert/strict";
import test from "node:test";
import type {
  EquipmentReinforcementItem,
  EquipmentReinforcementState,
} from "../../inventory/api/inventory.api";
import {
  getReinforcementProgress,
  getReinforcementStatChanges,
  selectReinforcementOpportunity,
} from "./reinforcementPresentation";

function item(
  id: string,
  tier: number,
  enhancementLevel: number,
  strengthBonus: number,
): EquipmentReinforcementItem {
  return {
    id,
    name: id,
    tier,
    enhancementLevel,
    strengthBonus,
  };
}

test("calcula apenas os atributos alterados pelo próximo reforço", () => {
  const changes = getReinforcementStatChanges(item("base", 1, 0, 8), {
    ...item("plus-one", 1, 1, 10),
    vitalityBonus: 1,
  });

  assert.deepEqual(
    changes.map(({ short, current, next, delta }) => ({
      short,
      current,
      next,
      delta,
    })),
    [
      { short: "FOR", current: 8, next: 10, delta: 2 },
      { short: "VIT", current: 0, next: 1, delta: 1 },
    ],
  );
});

test("seleciona o equipamento menos reforçado do tier solicitado", () => {
  const state: EquipmentReinforcementState = {
    maxLevel: 3,
    gold: 100,
    materials: [],
    slots: [
      {
        slot: "HEAD",
        item: item("t1-head-plus-one", 1, 1, 4),
        nextItem: item("t1-head-plus-two", 1, 2, 5),
        cost: {
          level: 2,
          fragmentCost: 7,
          goldCost: 60,
          materialName: "Fragmento de Reforço T1",
          materialBalance: 5,
          goldBalance: 100,
        },
      },
      {
        slot: "MAIN_HAND",
        item: item("t1-main", 1, 0, 8),
        nextItem: item("t1-main-plus-one", 1, 1, 10),
        cost: {
          level: 1,
          fragmentCost: 4,
          goldCost: 30,
          materialName: "Fragmento de Reforço T1",
          materialBalance: 5,
          goldBalance: 100,
        },
      },
      {
        slot: "ARMOR",
        item: item("t2-armor", 2, 0, 12),
        nextItem: item("t2-armor-plus-one", 2, 1, 14),
        cost: {
          level: 1,
          fragmentCost: 5,
          goldCost: 80,
          materialName: "Fragmento de Reforço T2",
          materialBalance: 0,
          goldBalance: 100,
        },
      },
    ],
  };

  const opportunity = selectReinforcementOpportunity(state, 1);

  assert.equal(opportunity?.slot, "MAIN_HAND");
  assert.deepEqual(getReinforcementProgress(opportunity), {
    current: 5,
    required: 4,
    remaining: 0,
    percent: 100,
  });
});
