import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegacyHuntingPresenceResponse,
  getRemotePlayerInterpolationSpeed,
  mergeHuntingVisualPlayers,
  type ActiveCharactersPresenceResponse,
} from "../utils/hunting-presence";
import type { HuntingVisualPresence } from "../../../services/websocket/socketClient";

const now = new Date("2026-09-12T15:00:00.000Z");

test("interpola poses remotas no ritmo do ator sem pausas entre pacotes", () => {
  assert.equal(getRemotePlayerInterpolationSpeed(0), 0);
  assert.equal(getRemotePlayerInterpolationSpeed(19.2), 96);
  assert.equal(getRemotePlayerInterpolationSpeed(32), 160);
  assert.equal(getRemotePlayerInterpolationSpeed(96), 320);
});

function entry({
  id,
  mapId = "map-1",
  activityType = "AUTO_COMBAT",
  activityLabel = "Rastreando ameaças",
}: {
  id: string;
  mapId?: string;
  activityType?: string;
  activityLabel?: string;
}) {
  return {
    character: {
      id,
      name: `Sobrevivente ${id}`,
      avatarKey: null,
      map: { id: mapId },
    },
    presence: {
      activity: { type: activityType, label: activityLabel },
    },
  };
}

test("fallback legado seleciona somente outros rastreadores do mesmo mapa", () => {
  const response = buildLegacyHuntingPresenceResponse(
    {
      characters: [
        entry({ id: "local" }),
        entry({ id: "same-map" }),
        entry({ id: "other-map", mapId: "map-2" }),
        entry({ id: "combat", activityLabel: "Em combate" }),
        entry({ id: "gathering", activityType: "GATHERING" }),
      ],
    } satisfies ActiveCharactersPresenceResponse,
    "local",
    "map-1",
    now,
  );

  assert.deepEqual(response, {
    mapId: "map-1",
    subMapId: null,
    updatedAt: now.toISOString(),
    characters: [
      {
        id: "same-map",
        name: "Sobrevivente same-map",
        avatarKey: null,
        phase: "HUNTING",
        startedAt: now.toISOString(),
      },
    ],
  });
});

test("fallback legado nao lista presencas sem mapa e limita a 24", () => {
  assert.deepEqual(
    buildLegacyHuntingPresenceResponse(
      { characters: [entry({ id: "remote" })] },
      "local",
      null,
      now,
    ).characters,
    [],
  );

  const response = buildLegacyHuntingPresenceResponse(
    {
      characters: Array.from({ length: 30 }, (_, index) =>
        entry({ id: `remote-${index}` }),
      ),
    },
    "local",
    "map-1",
    now,
  );

  assert.equal(response.characters.length, 24);
  assert.equal(response.characters.at(-1)?.id, "remote-23");
});

test("a pose ao vivo prevalece sobre a posicao salva em Idle", () => {
  const fallback: HuntingVisualPresence = {
    characterId: "remote",
    displayName: "Sobrevivente",
    mapId: "map-1",
    subMapId: null,
    areaId: "suburbio",
    tileX: 10,
    tileY: 8,
    direction: "down",
    visualState: "walking",
    moving: false,
    updatedAt: 0,
  };
  const live = {
    ...fallback,
    tileX: 14.5,
    direction: "right" as const,
    visualState: "investigating" as const,
    moving: true,
    updatedAt: 1234,
  };
  assert.deepEqual(mergeHuntingVisualPlayers([fallback], []), [{
    id: "remote",
    displayName: "Sobrevivente",
    areaId: "suburbio",
    worldX: 320,
    worldY: 256,
    direction: "down",
    visualState: "walking",
    moving: false,
    updatedAt: 0,
    idle: true,
  }]);
  assert.deepEqual(mergeHuntingVisualPlayers([fallback], [live]), [{
    id: "remote",
    displayName: "Sobrevivente",
    areaId: "suburbio",
    worldX: 464,
    worldY: 256,
    direction: "right",
    visualState: "investigating",
    moving: true,
    updatedAt: 1234,
    idle: false,
  }]);
  assert.equal(mergeHuntingVisualPlayers([], []).length, 0);
});

test("preserva o alvo e o ciclo da batalha na presenca ao vivo", () => {
  const combatPresence: HuntingVisualPresence = {
    characterId: "remote-combat",
    displayName: "Combatente",
    mapId: "map-1",
    subMapId: "submap-1",
    areaId: "suburbio",
    tileX: 15,
    tileY: 9,
    direction: "right",
    visualState: "combat",
    moving: false,
    combatMobName: "Síndico Devorado",
    combatCycleKey: "session-1:round-4",
    updatedAt: 4321,
  };

  assert.deepEqual(mergeHuntingVisualPlayers([], [combatPresence]), [
    {
      id: "remote-combat",
      displayName: "Combatente",
      areaId: "suburbio",
      worldX: 480,
      worldY: 288,
      direction: "right",
      visualState: "combat",
      moving: false,
      combatMobName: "Síndico Devorado",
      combatCycleKey: "session-1:round-4",
      updatedAt: 4321,
      idle: false,
    },
  ]);
});
