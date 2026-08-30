import assert from "node:assert/strict";
import test from "node:test";
import type { AutoCombatRealtimeEvent } from "../types/auto-combat.types";
import { getPotionQuantity, resolvePotionQuantityAfter } from "./potion-stock";

test("saldo explícito do backend prevalece ao consumir uma poção", () => {
  const event = {
    type: "POTION_USED",
    potionQuantityBefore: 12,
    potionQuantityAfter: 11,
    potionQuantityRemaining: 9,
    potionUsedQuantity: 1,
  } as AutoCombatRealtimeEvent;

  assert.equal(resolvePotionQuantityAfter(event, 99), 9);
});

test("consumo agrupado offline desconta a quantidade usada de uma vez", () => {
  const event = {
    type: "POTION_USED",
    potionQuantityBefore: 25,
    potionUsedQuantity: 4,
  } as AutoCombatRealtimeEvent;

  assert.equal(resolvePotionQuantityAfter(event, 40), 21);
});

test("fallback realtime nunca deixa o estoque de poções negativo", () => {
  const event = {
    type: "POTION_USED",
    potionUsedQuantity: 3,
  } as AutoCombatRealtimeEvent;

  assert.equal(resolvePotionQuantityAfter(event, 2), 0);
});

test("saldo carregado do inventário prevalece sobre configuração antiga", () => {
  const potionItem = {
    id: "potion-1",
    name: "Poção de Vida",
    availableQuantity: 15,
  };

  const quantity = getPotionQuantity(
    {
      id: "config-1",
      enabled: true,
      useInAutoCombat: true,
      hpThresholdPercent: 35,
      potionItemId: potionItem.id,
      potion: potionItem,
    },
    [
      {
        ...potionItem,
        itemId: potionItem.id,
        quantity: 7,
      },
    ],
  );

  assert.equal(quantity, 7);
});
