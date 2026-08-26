import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHuntingActivityQueue,
  countHuntingActivityQueue,
  resolveHuntingActivityTarget,
} from "./huntingActivityPresentation";

test("resolve o alvo atual sem somá-lo à fila concluída", () => {
  const target = resolveHuntingActivityTarget([
    {
      id: "encounter-cat",
      mobId: "mob-cat",
      mob: {
        id: "mob-cat",
        name: "Gato de Telhado Contaminado",
        level: 4,
        tier: 1,
      },
    },
  ]);
  const queue = buildHuntingActivityQueue([
    [
      {
        mobId: "mob-rat",
        mobName: "Rato de Lixeira Infectado",
        foundCount: 3,
        remainingCount: 3,
      },
    ],
  ]);

  assert.equal(target?.name, "Gato de Telhado Contaminado");
  assert.equal(target?.encounterId, "encounter-cat");
  assert.equal(countHuntingActivityQueue(queue), 3);
});

test("usa uma única fonte autoritativa e não duplica snapshots espelhados", () => {
  const source = [
    {
      mobId: "mob-1",
      mobName: "Errante do Subúrbio",
      mobLevel: 1,
      mobTier: 1,
      foundCount: 8,
      remainingCount: 6,
    },
  ];
  const queue = buildHuntingActivityQueue([source, source]);

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.count, 6);
  assert.equal(countHuntingActivityQueue(queue), 6);
});

test("agrupa o mesmo monstro e remove entradas já consumidas", () => {
  const queue = buildHuntingActivityQueue([
    [
      {
        mobId: "mob-2",
        mobName: "Rato de Lixeira Infectado",
        mobLevel: 2,
        mobTier: 1,
        foundCount: 2,
      },
      {
        mobId: "mob-2",
        mobName: "Rato de Lixeira Infectado",
        mobLevel: 2,
        mobTier: 1,
        foundCount: 5,
        remainingCount: 4,
      },
      {
        mobId: "mob-3",
        mobName: "Cão de Rua Infectado",
        foundCount: 4,
        remainingCount: 0,
      },
    ],
  ]);

  assert.deepEqual(
    queue.map(({ name, count }) => ({ name, count })),
    [{ name: "Rato de Lixeira Infectado", count: 6 }],
  );
});
