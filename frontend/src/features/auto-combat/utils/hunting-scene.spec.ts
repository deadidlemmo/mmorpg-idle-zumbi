import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chooseRandomHuntingDestination,
  createHuntingAreaFromTiledMap,
  findHuntingCombatFormation,
  findHuntingPath,
  getHuntingNavigationPoint,
  getHuntingPortal,
  HUNTING_AREA_IDS,
  HUNTING_TILED_LAYER_NAMES,
  HUNTING_TILE_LAYER_NAMES,
  isHuntingPointWalkable,
  isHuntingSegmentWalkable,
  isHuntingTileWalkable,
  resolveHuntingStartingPoint,
  isSuburbioSilenciosoTierOneScene,
  validateHuntingArea,
  worldToHuntingTile,
  type HuntingCoordinate,
  type HuntingTiledMapSource,
  type HuntingWorldArea,
} from "./hunting-scene";

function loadTiledArea(fileName: string) {
  const source = JSON.parse(
    readFileSync(
      new URL(`../../../assets/maps/auto-combat/${fileName}`, import.meta.url),
      "utf8",
    ),
  ) as HuntingTiledMapSource;
  return { source, area: createHuntingAreaFromTiledMap(source) };
}

const exterior = loadTiledArea("suburbio-silencioso-pilot.tmj");
const interior = loadTiledArea("suburbio-silencioso-t1-interior.tmj");

test("retoma a posicao valida na casa e recusa tile bloqueado ou area trocada", () => {
  const point = interior.area.navigationPoints.find((entry) => entry.isDestination);
  assert.ok(point);
  const pose = { areaId: HUNTING_AREA_IDS.abandonedHouse,
    tileX: point.x / interior.area.tileWidth,
    tileY: point.y / interior.area.tileHeight };
  assert.deepEqual(resolveHuntingStartingPoint(interior.area, pose), {
    x: point.x, y: point.y,
  });
  const spawn = getHuntingNavigationPoint(interior.area, interior.area.spawnNodeId);
  assert.deepEqual(resolveHuntingStartingPoint(interior.area, { ...pose, tileX: -1 }), spawn);
  assert.deepEqual(resolveHuntingStartingPoint(interior.area, { ...pose, areaId: HUNTING_AREA_IDS.outdoor }), spawn);
});

function assertPathIsWalkable(
  area: HuntingWorldArea,
  path: readonly HuntingCoordinate[],
) {
  assert.ok(path.length >= 2);
  path.slice(1).forEach((target, index) => {
    const start = path[index];
    assert.equal(isHuntingSegmentWalkable(area, start, target), true);
    const startTile = worldToHuntingTile(area, start);
    const targetTile = worldToHuntingTile(area, target);
    assert.ok(
      startTile.column === targetTile.column ||
        startTile.row === targetTile.row,
      "a rota deve usar apenas movimentos cardinais",
    );
  });
}

function getLayer(source: HuntingTiledMapSource, name: string) {
  const layer = source.layers.find((candidate) => candidate.name === name);
  assert.ok(layer, `camada ausente: ${name}`);
  return layer;
}

test("habilita a cena apenas para o Suburbio Silencioso Tier 1", () => {
  assert.equal(
    isSuburbioSilenciosoTierOneScene({
      mapName: "Subúrbio Silencioso",
      tier: 1,
    }),
    true,
  );
  assert.equal(
    isSuburbioSilenciosoTierOneScene({
      mapName: "Suburbio Silencioso",
      tier: 2,
    }),
    false,
  );
});

test("usa tileset real e as dez camadas semanticas do mapa", () => {
  for (const { source } of [exterior, interior]) {
    assert.ok((source.tilesets?.length ?? 0) >= 1);
    assert.equal(
      source.layers.some((layer) => layer.type === "imagelayer"),
      false,
    );
    for (const layerName of HUNTING_TILE_LAYER_NAMES) {
      assert.equal(getLayer(source, layerName).type, "tilelayer");
    }
    assert.equal(
      getLayer(source, HUNTING_TILED_LAYER_NAMES.entrancesAndExits).type,
      "objectgroup",
    );
    assert.equal(
      getLayer(source, HUNTING_TILED_LAYER_NAMES.navigationPoints).type,
      "objectgroup",
    );
  }
  const exteriorTilesets = exterior.source.tilesets as ReadonlyArray<
    Readonly<{ name?: string; source?: string }>
  >;
  assert.deepEqual(
    exteriorTilesets.map((tileset) => tileset.name),
    [
      "suburbio-pilot-terrain",
      "suburbio-pilot-props",
      "suburbio-pilot-environment",
      "suburbio-pilot-house-one",
      "suburbio-pilot-house-two",
    ],
  );
  assert.equal(
    exteriorTilesets.some((tileset) => tileset.source),
    false,
  );
  const interiorTilesets = interior.source.tilesets as ReadonlyArray<
    Readonly<{ name?: string }>
  >;
  assert.deepEqual(
    interiorTilesets.map((tileset) => tileset.name),
    ["suburbio-interior-terrain", "suburbio-interior-walls"],
  );
});

test("mantem moveis do interior separados da camada superior", () => {
  const objectsAbove =
    getLayer(
      interior.source,
      HUNTING_TILED_LAYER_NAMES.objectsAbove,
    ).data ?? [];
  const depthObjects = getLayer(interior.source, "depth-objects").objects ?? [];

  assert.equal(objectsAbove.some((tile) => tile !== 0), false);
  assert.ok(depthObjects.length >= 12);
  for (const object of depthObjects) {
    assert.ok(object.x !== undefined && object.y !== undefined);
  }
});

test("mantem a vegetacao baixa da casa esquerda sob o personagem", () => {
  const objectsBelow =
    getLayer(
      exterior.source,
      HUNTING_TILED_LAYER_NAMES.objectsBelow,
    ).data ?? [];
  const objectsAbove =
    getLayer(
      exterior.source,
      HUNTING_TILED_LAYER_NAMES.objectsAbove,
    ).data ?? [];

  for (let row = 11; row <= 13; row += 1) {
    for (let column = 14; column <= 17; column += 1) {
      const index = row * exterior.area.columns + column;
      assert.notEqual(objectsBelow[index], 0);
      if (!(row === 11 && column === 14)) {
        assert.equal(objectsAbove[index], 0);
      }
    }
  }
});

test("cria a area piloto em grade de 32 pixels e um interior separado", () => {
  assert.equal(exterior.area.columns, 48);
  assert.equal(exterior.area.rows, 32);
  assert.equal(exterior.area.tileWidth, 32);
  assert.equal(exterior.area.width, 1536);
  assert.equal(exterior.area.height, 1024);
  assert.equal(interior.area.columns, 44);
  assert.equal(interior.area.rows, 28);
  assert.equal(interior.area.width, 1408);
  assert.equal(interior.area.height, 896);
});

test("mantem spawn, destinos e portais conectados pelo A estrela cardinal", () => {
  assert.deepEqual(validateHuntingArea(exterior.area), []);
  assert.deepEqual(validateHuntingArea(interior.area), []);
  for (const area of [exterior.area, interior.area]) {
    const spawn = getHuntingNavigationPoint(area, area.spawnNodeId);
    assert.ok(spawn);
    for (const destination of area.navigationPoints) {
      if (destination.id === spawn.id) continue;
      assertPathIsWalkable(area, findHuntingPath(area, spawn, destination));
    }
  }
});

test("usa a camada collision como fonte unica da navegacao", () => {
  for (const { source } of [exterior, interior]) {
    const ground =
      getLayer(source, HUNTING_TILED_LAYER_NAMES.ground).data ?? [];
    const collision =
      getLayer(source, HUNTING_TILED_LAYER_NAMES.collision).data ?? [];
    const area = createHuntingAreaFromTiledMap(source);
    collision.forEach((tile, index) => {
      const column = index % area.columns;
      const row = Math.floor(index / area.columns);
      assert.equal(
        isHuntingTileWalkable(area, column, row),
        ground[index] !== 0 && tile === 0,
        `${area.id}:${column},${row}`,
      );
    });
  }
});

test("bloqueia paredes, carros, arvores, moveis e portas fechadas", () => {
  assert.equal(isHuntingTileWalkable(exterior.area, 2, 2), false);
  assert.equal(isHuntingTileWalkable(exterior.area, 31, 18), false);
  assert.equal(isHuntingTileWalkable(exterior.area, 15, 8), false);
  assert.equal(isHuntingTileWalkable(exterior.area, 8, 10), false);
  assert.equal(isHuntingTileWalkable(exterior.area, 8, 11), true);
  assert.equal(isHuntingTileWalkable(exterior.area, 3, 11), false);
  assert.equal(isHuntingTileWalkable(exterior.area, 31, 13), false);
  assert.equal(isHuntingTileWalkable(interior.area, 4, 3), false);
  assert.equal(isHuntingTileWalkable(interior.area, 9, 16), false);
  assert.equal(isHuntingTileWalkable(interior.area, 29, 13), false);
  assert.equal(isHuntingTileWalkable(interior.area, 21, 24), false);
  assert.equal(isHuntingTileWalkable(interior.area, 21, 23), true);
  assert.equal(
    isHuntingPointWalkable(exterior.area, { x: 31.5 * 32, y: 18.5 * 32 }),
    false,
  );
});

test("posiciona o combate sem atravessar paredes ou objetos", () => {
  for (const area of [exterior.area, interior.area]) {
    for (const actor of area.navigationPoints) {
      for (const direction of ["down", "left", "right", "up"] as const) {
        const formation = findHuntingCombatFormation(area, actor, direction);
        assert.equal(isHuntingPointWalkable(area, formation.target), true);
        assert.equal(isHuntingPointWalkable(area, formation.spawn), true);
        assert.equal(
          isHuntingSegmentWalkable(area, actor, formation.target),
          true,
        );
        assert.equal(
          isHuntingSegmentWalkable(area, formation.target, formation.spawn),
          true,
        );
      }
    }
  }
});

test("alcanca a casa somente pelo ponto externo da porta", () => {
  const spawn = getHuntingNavigationPoint(
    exterior.area,
    exterior.area.spawnNodeId,
  );
  const door = getHuntingNavigationPoint(
    exterior.area,
    "casa-abandonada-porta",
  );
  assert.ok(spawn);
  assert.ok(door);
  assertPathIsWalkable(
    exterior.area,
    findHuntingPath(exterior.area, spawn, door),
  );
  const portal = getHuntingPortal(exterior.area, door.id);
  assert.ok(portal);
  assert.equal(
    isHuntingTileWalkable(exterior.area, portal.doorColumn, portal.doorRow),
    false,
  );
});

test("simula duas mil rotas sem atravessar qualquer tile bloqueado", () => {
  const routeCache = new Map<string, readonly HuntingCoordinate[]>();
  let seed = 7919;
  const next = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let iteration = 0; iteration < 2000; iteration += 1) {
    const area = iteration % 5 === 0 ? interior.area : exterior.area;
    const points = area.navigationPoints;
    const start = points[Math.floor(next() * points.length)];
    const destination = points[Math.floor(next() * points.length)];
    if (start.id === destination.id) continue;
    const key = `${area.id}:${start.id}:${destination.id}`;
    let path = routeCache.get(key);
    if (!path) {
      path = findHuntingPath(area, start, destination);
      routeCache.set(key, path);
    }
    assertPathIsWalkable(area, path);
  }
});

test("sorteia apenas destinos realmente alcancaveis", () => {
  for (const area of [exterior.area, interior.area]) {
    const start = getHuntingNavigationPoint(area, area.spawnNodeId);
    assert.ok(start);
    for (const randomValue of [0, 0.25, 0.5, 0.75, 0.999]) {
      const destination = chooseRandomHuntingDestination(
        area,
        start,
        () => randomValue,
      );
      assert.ok(destination);
      assert.notEqual(destination.id, area.portalNodeId);
      assertPathIsWalkable(area, findHuntingPath(area, start, destination));
    }
  }
});

test("conecta exterior e interior por portais reciprocos", () => {
  const enter = getHuntingPortal(exterior.area, exterior.area.portalNodeId);
  const exit = getHuntingPortal(interior.area, interior.area.portalNodeId);
  assert.equal(enter?.toAreaId, HUNTING_AREA_IDS.abandonedHouse);
  assert.equal(enter?.toNodeId, "entrada");
  assert.equal(exit?.toAreaId, HUNTING_AREA_IDS.outdoor);
  assert.equal(exit?.toNodeId, exterior.area.portalNodeId);
});
