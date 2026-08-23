import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoCombatEventTelemetry,
  resolveAutoCombatTelemetryContext,
  shouldUseCondensedAutoCombatPlayback,
} from "./auto-combat-telemetry";

test("mede atraso percebido, fila e lacuna de sequência", () => {
  const result = buildAutoCombatEventTelemetry({
    characterId: "character-1",
    event: {
      type: "MOB_SPAWNED",
      sequence: 14,
      serverTime: "2026-08-23T09:00:00.000Z",
    },
    receivedAtMs: Date.parse("2026-08-23T09:00:00.480Z"),
    queueDepth: 3,
    previousSequence: 11,
  });

  assert.equal(result.sequence, 14);
  assert.deepEqual(result.payload, {
    characterId: "character-1",
    kind: "EVENT_RECEIVED",
    eventType: "MOB_SPAWNED",
    transitDelayMs: 480,
    queueDepth: 3,
    sequenceGap: 2,
    outOfOrder: false,
  });
});

test("marca evento fora de ordem sem produzir atraso negativo", () => {
  const result = buildAutoCombatEventTelemetry({
    characterId: "character-1",
    event: {
      type: "PLAYER_HIT",
      sequence: 7,
      serverTime: "2026-08-23T09:00:01.000Z",
    },
    receivedAtMs: Date.parse("2026-08-23T09:00:00.900Z"),
    queueDepth: 0,
    previousSequence: 8,
  });

  assert.equal(result.payload.transitDelayMs, 0);
  assert.equal(result.payload.sequenceGap, 0);
  assert.equal(result.payload.outOfOrder, true);
});

test("classifica contexto e marca eventos recebidos apos retorno da aba", () => {
  const result = buildAutoCombatEventTelemetry({
    characterId: "character-1",
    event: {
      type: "MOB_DEFEATED",
      sequence: 20,
      serverTime: "2026-08-23T09:00:00.000Z",
    },
    receivedAtMs: Date.parse("2026-08-23T09:00:00.250Z"),
    queueDepth: 1,
    previousSequence: 19,
    metadata: {
      context: "combat-page",
      afterVisibilityReturn: true,
    },
  });

  assert.equal(result.payload.context, "combat-page");
  assert.equal(result.payload.afterVisibilityReturn, true);
});

test("resolve os quatro contextos operacionais da coleta", () => {
  assert.equal(
    resolveAutoCombatTelemetryContext({ hidden: true }),
    "tab-hidden",
  );
  assert.equal(
    resolveAutoCombatTelemetryContext({ reconnected: true }),
    "reconnected",
  );
  assert.equal(
    resolveAutoCombatTelemetryContext({
      pathname: "/dashboard/character-1/auto-combat",
      hidden: false,
    }),
    "combat-page",
  );
  assert.equal(
    resolveAutoCombatTelemetryContext({
      pathname: "/dashboard/character-1/inventory",
      hidden: false,
    }),
    "other-page",
  );
});

test("aplica eventos sem atraso artificial nas telas visiveis com timeline ativa", () => {
  assert.equal(
    shouldUseCondensedAutoCombatPlayback({
      presentationTimelineEnabled: true,
      context: "other-page",
    }),
    true,
  );
  assert.equal(
    shouldUseCondensedAutoCombatPlayback({
      presentationTimelineEnabled: true,
      context: "combat-page",
    }),
    true,
  );
  assert.equal(
    shouldUseCondensedAutoCombatPlayback({
      presentationTimelineEnabled: false,
      context: "other-page",
    }),
    false,
  );
});
