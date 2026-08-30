import assert from "node:assert/strict";
import test from "node:test";
import type { WorldBossStatusResponse } from "../types/world-bosses.types.ts";
import {
  getWorldBossAlertKey,
  getWorldBossAlertMilestone,
} from "./worldBossAlerts.ts";

function buildStatus(
  status: "SCHEDULED" | "LOBBY_OPEN" | "ACTIVE",
  startsAt: string,
): WorldBossStatusResponse {
  return {
    event: {
      id: "event-1",
      status,
      startsAt,
      endsAt: "2026-08-29T16:00:00.000Z",
      remainingSeconds: 0,
      currentHp: 1,
      maxHp: 1,
      hpPercent: 100,
      progressPercent: 0,
      totalDamage: 0,
      participantCount: 0,
      worldBoss: {
        id: "boss-1",
        name: "Síndico Devorado",
        slug: "sindico-devorado",
        tier: 1,
        minLevel: 1,
        maxLevel: 10,
        durationSeconds: 10_800,
        difficulty: "CONTENCAO",
        riskLevel: 1,
        attackPower: 1,
        defense: 1,
        resistance: 1,
        mutationLevel: 1,
        map: { id: "map-1", name: "Subúrbio Silencioso", tier: 1 },
        rewards: [],
      },
    },
    participant: null,
  };
}

test("seleciona somente o marco mais urgente da contagem", () => {
  const now = Date.parse("2026-08-29T12:00:00.000Z");

  assert.equal(
    getWorldBossAlertMilestone(
      buildStatus("SCHEDULED", "2026-08-29T12:59:30.000Z"),
      now,
    ),
    "ONE_HOUR",
  );
  assert.equal(
    getWorldBossAlertMilestone(
      buildStatus("SCHEDULED", "2026-08-29T12:14:30.000Z"),
      now,
    ),
    "FIFTEEN_MINUTES",
  );
});

test("avisa lobby aberto e não cria alerta tardio para batalha ativa", () => {
  const now = Date.parse("2026-08-29T12:00:00.000Z");

  assert.equal(
    getWorldBossAlertMilestone(
      buildStatus("LOBBY_OPEN", "2026-08-29T12:00:00.000Z"),
      now,
    ),
    "LOBBY_OPEN",
  );
  assert.equal(
    getWorldBossAlertMilestone(
      buildStatus("ACTIVE", "2026-08-29T11:45:00.000Z"),
      now,
    ),
    null,
  );
});

test("a chave de dedupe separa personagem, evento e marco", () => {
  assert.notEqual(
    getWorldBossAlertKey("character-1", "event-1", "ONE_HOUR"),
    getWorldBossAlertKey("character-1", "event-1", "FIFTEEN_MINUTES"),
  );
  assert.notEqual(
    getWorldBossAlertKey("character-1", "event-1", "ONE_HOUR"),
    getWorldBossAlertKey("character-2", "event-1", "ONE_HOUR"),
  );
});
