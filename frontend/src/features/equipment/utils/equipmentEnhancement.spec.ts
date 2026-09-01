import assert from "node:assert/strict";
import test from "node:test";
import {
  getEquipmentBaseDisplayName,
  getEquipmentEnhancementLevel,
} from "./equipmentEnhancement";

test("normaliza o nível de reforço para a faixa visual de zero a três", () => {
  assert.equal(getEquipmentEnhancementLevel(), 0);
  assert.equal(getEquipmentEnhancementLevel({ enhancementLevel: 0 }), 0);
  assert.equal(
    getEquipmentEnhancementLevel({ enhancementLevel: 0, name: "Peça +2" }),
    0,
  );
  assert.equal(getEquipmentEnhancementLevel({ enhancementLevel: 2.9 }), 2);
  assert.equal(getEquipmentEnhancementLevel({ enhancementLevel: 9 }), 3);
});

test("usa o sufixo do nome como compatibilidade para respostas antigas", () => {
  assert.equal(getEquipmentEnhancementLevel({ name: "Machado de Ferro +1" }), 1);
  assert.equal(getEquipmentEnhancementLevel({ name: "Colete Reforçado +3" }), 3);
  assert.equal(getEquipmentEnhancementLevel({ name: "Escudo comum" }), 0);
});

test("remove apenas o sufixo de reforço do nome exibido", () => {
  assert.equal(
    getEquipmentBaseDisplayName({ name: "Machado de Ferro +2" }),
    "Machado de Ferro",
  );
  assert.equal(
    getEquipmentBaseDisplayName({ name: "Kit + médico" }),
    "Kit + médico",
  );
});
