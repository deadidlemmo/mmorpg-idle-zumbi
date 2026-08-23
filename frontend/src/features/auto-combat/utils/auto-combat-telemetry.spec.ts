import assert from "node:assert/strict";
import test from "node:test";
import { buildAutoCombatEventTelemetry } from "./auto-combat-telemetry";

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
