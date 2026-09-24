import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHuntingActivityQueue,
  buildHuntingDefeatedQueue,
  countHuntingActivityQueue,
  mergeHuntingDefeatedRealtimeEvents,
  resolveHuntingActivityTarget,
} from "./huntingActivityPresentation";

test("resume somente mobs derrotados sem misturar rastreados pendentes", () => {
  const queue = buildHuntingDefeatedQueue([
    [
      {
        mobId: "mob-bat",
        mobName: "Morcego de Caixa d’Água",
        mobLevel: 5,
        mobTier: 1,
        kills: 2,
      },
      {
        mobId: "mob-bat",
        mobName: "Morcego de Caixa d’Água",
        mobLevel: 5,
        mobTier: 1,
        kills: 1,
      },
      {
        mobId: "mob-cat",
        mobName: "Gato de Telhado Contaminado",
        kills: 0,
      },
    ],
  ]);

  assert.deepEqual(
    queue.map(({ name, count }) => ({ name, count })),
    [{ name: "Morcego de Caixa d’Água", count: 3 }],
  );
});

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

test("incorpora abates realtime sem esperar um novo snapshot REST", () => {
  const canonical = buildHuntingDefeatedQueue([
    [{ mobId: "errante", mobName: "Errante", kills: 4 }],
  ]);
  const merged = mergeHuntingDefeatedRealtimeEvents(canonical, [
    {
      eventKey: "kill-5",
      type: "MOB_DEFEATED",
      mobId: "errante",
      mobName: "Errante",
      totalKills: 5,
      killsGained: 1,
    },
    {
      eventKey: "kill-6",
      type: "MOB_DEFEATED",
      mobId: "gato",
      mobName: "Gato contaminado",
      totalKills: 6,
      killsGained: 1,
    },
  ]);

  assert.equal(countHuntingActivityQueue(merged), 6);
  assert.equal(merged.find((entry) => entry.mobId === "errante")?.count, 5);
  assert.equal(merged.find((entry) => entry.mobId === "gato")?.count, 1);
});

test("nao duplica evento realtime ja absorvido pelo resumo canonico", () => {
  const canonical = buildHuntingDefeatedQueue([
    [
      { mobId: "errante", mobName: "Errante", kills: 5 },
      { mobId: "gato", mobName: "Gato contaminado", kills: 1 },
    ],
  ]);
  const merged = mergeHuntingDefeatedRealtimeEvents(canonical, [
    {
      eventKey: "kill-6",
      type: "MOB_DEFEATED",
      mobId: "gato",
      mobName: "Gato contaminado",
      totalKills: 6,
      killsGained: 1,
    },
  ]);

  assert.deepEqual(merged, canonical);
});
