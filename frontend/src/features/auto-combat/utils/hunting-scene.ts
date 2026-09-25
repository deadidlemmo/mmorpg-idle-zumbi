function normalizeSceneMapName(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isSuburbioSilenciosoTierOneScene(params: {
  mapName?: string | null;
  tier?: number | null;
}) {
  return (
    normalizeSceneMapName(params.mapName) === "suburbio-silencioso" &&
    Number(params.tier) === 1
  );
}

export function isDistritoFerrugemTierTwoScene(params: {
  mapName?: string | null;
  tier?: number | null;
}) {
  return (
    normalizeSceneMapName(params.mapName) === "distrito-da-ferrugem" &&
    Number(params.tier) === 2
  );
}

export function isAnimatedHuntingSceneMap(params: {
  mapName?: string | null;
  tier?: number | null;
}) {
  return (
    isSuburbioSilenciosoTierOneScene(params) ||
    isDistritoFerrugemTierTwoScene(params)
  );
}

export const HUNTING_AREA_IDS = {
  outdoor: "suburbio",
  abandonedHouse: "casa-abandonada",
  rustDistrict: "distrito-ferrugem",
  rustWarehouse: "galpao-ferrugem",
} as const;

export type HuntingAreaId =
  (typeof HUNTING_AREA_IDS)[keyof typeof HUNTING_AREA_IDS];

export const HUNTING_TILED_LAYER_NAMES = {
  ground: "ground",
  groundDetails: "ground-details",
  objectsBelow: "objects-below",
  collision: "collision",
  wallsAndFences: "walls-fences",
  doors: "doors",
  objectsAbove: "objects-above",
  roofsAndOcclusion: "roofs-occlusion",
  entrancesAndExits: "entrances-exits",
  navigationPoints: "navigation-points",
} as const;

export const HUNTING_TILE_LAYER_NAMES = [
  HUNTING_TILED_LAYER_NAMES.ground,
  HUNTING_TILED_LAYER_NAMES.groundDetails,
  HUNTING_TILED_LAYER_NAMES.objectsBelow,
  HUNTING_TILED_LAYER_NAMES.collision,
  HUNTING_TILED_LAYER_NAMES.wallsAndFences,
  HUNTING_TILED_LAYER_NAMES.doors,
  HUNTING_TILED_LAYER_NAMES.objectsAbove,
  HUNTING_TILED_LAYER_NAMES.roofsAndOcclusion,
] as const;

const REQUIRED_OBJECT_LAYER_NAMES = [
  HUNTING_TILED_LAYER_NAMES.entrancesAndExits,
  HUNTING_TILED_LAYER_NAMES.navigationPoints,
] as const;

export type HuntingCoordinate = Readonly<{ x: number; y: number }>;

export type HuntingDirection = "down" | "left" | "right" | "up";

export type HuntingCombatFormation = Readonly<{
  target: HuntingCoordinate;
  spawn: HuntingCoordinate;
}>;

export type HuntingNavigationPoint = HuntingCoordinate &
  Readonly<{ id: string; isDestination: boolean }>;

export type HuntingWorldPortal = Readonly<{
  fromAreaId: HuntingAreaId;
  fromNodeId: string;
  toAreaId: HuntingAreaId;
  toNodeId: string;
  doorColumn: number;
  doorRow: number;
}>;

export type HuntingWorldArea = Readonly<{
  id: HuntingAreaId;
  label: string;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  width: number;
  height: number;
  spawnNodeId: string;
  portalNodeId: string;
  randomRouteMinDistance: number;
  agentHalfWidth: number;
  agentHalfHeight: number;
  groundTiles: readonly number[];
  collisionTiles: readonly number[];
  navigationPoints: readonly HuntingNavigationPoint[];
  portals: readonly HuntingWorldPortal[];
}>;

export type HuntingTiledProperty = Readonly<{
  name: string;
  value: unknown;
  type?: string;
}>;

export type HuntingTiledObject = Readonly<{
  id: number;
  name?: string;
  x?: number;
  y?: number;
  point?: boolean;
  properties?: readonly HuntingTiledProperty[] | Record<string, unknown>;
}>;

export type HuntingTiledLayer = Readonly<{
  name: string;
  type: string;
  width?: number;
  height?: number;
  data?: readonly number[];
  objects?: readonly HuntingTiledObject[];
}>;

export type HuntingTiledMapSource = Readonly<{
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  properties?: readonly HuntingTiledProperty[] | Record<string, unknown>;
  layers: readonly HuntingTiledLayer[];
  tilesets?: readonly Readonly<{
    firstgid: number;
    name?: string;
    tilecount?: number;
    columns?: number;
    margin?: number;
    spacing?: number;
    tilewidth?: number;
    tileheight?: number;
  }>[];
}>;

type NavigationCell = Readonly<{
  column: number;
  row: number;
  x: number;
  y: number;
}>;

type TiledProperties =
  | readonly HuntingTiledProperty[]
  | Record<string, unknown>
  | undefined;

function readProperty(properties: TiledProperties, name: string) {
  if (Array.isArray(properties)) {
    return properties.find((property) => property.name === name)?.value;
  }
  return (properties as Record<string, unknown> | undefined)?.[name];
}

function readNumberProperty(
  properties: TiledProperties,
  name: string,
  fallback: number,
) {
  const parsed = Number(readProperty(properties, name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStringProperty(properties: TiledProperties, name: string) {
  const value = readProperty(properties, name);
  return typeof value === "string" ? value : "";
}

function readBooleanProperty(
  properties: TiledProperties,
  name: string,
  fallback: boolean,
) {
  const value = readProperty(properties, name);
  return typeof value === "boolean" ? value : fallback;
}

function parseAreaId(value: string, propertyName: string): HuntingAreaId {
  if (Object.values(HUNTING_AREA_IDS).includes(value as HuntingAreaId)) {
    return value as HuntingAreaId;
  }
  throw new Error(`Area invalida em ${propertyName}: ${value || "vazia"}`);
}

function getTileLayer(source: HuntingTiledMapSource, name: string) {
  const layer = source.layers.find(
    (candidate) => candidate.type === "tilelayer" && candidate.name === name,
  );
  if (!layer) throw new Error(`Camada Tiled obrigatoria ausente: ${name}`);
  if (
    layer.width !== source.width ||
    layer.height !== source.height ||
    layer.data?.length !== source.width * source.height
  ) {
    throw new Error(`Camada Tiled invalida: ${name}`);
  }
  return layer;
}

function getObjectLayer(source: HuntingTiledMapSource, name: string) {
  const layer = source.layers.find(
    (candidate) => candidate.type === "objectgroup" && candidate.name === name,
  );
  if (!layer) throw new Error(`Camada Tiled obrigatoria ausente: ${name}`);
  return layer;
}

export function createHuntingAreaFromTiledMap(source: HuntingTiledMapSource) {
  if (!source.tilesets?.length) {
    throw new Error("O mapa de rastreio precisa usar pelo menos um tileset real.");
  }
  HUNTING_TILE_LAYER_NAMES.forEach((name) => getTileLayer(source, name));
  REQUIRED_OBJECT_LAYER_NAMES.forEach((name) => getObjectLayer(source, name));

  const id = parseAreaId(readStringProperty(source.properties, "areaId"), "areaId");
  const navigationPoints =
    getObjectLayer(source, HUNTING_TILED_LAYER_NAMES.navigationPoints).objects?.map(
      (object) => {
        if (!object.name || object.point !== true) {
          throw new Error("Ponto de navegacao Tiled sem nome ou sem point=true");
        }
        return {
          id: object.name,
          x: Number(object.x ?? 0),
          y: Number(object.y ?? 0),
          isDestination: readBooleanProperty(
            object.properties,
            "destination",
            true,
          ),
        };
      },
    ) ?? [];
  const portals =
    getObjectLayer(source, HUNTING_TILED_LAYER_NAMES.entrancesAndExits).objects?.flatMap(
      (object) => {
        const toAreaId = readStringProperty(object.properties, "toAreaId");
        const toNodeId = readStringProperty(object.properties, "toNodeId");
        const fromNodeId = readStringProperty(object.properties, "nodeId");
        if (!toAreaId || !toNodeId || !fromNodeId) return [];
        return [
          {
            fromAreaId: id,
            fromNodeId,
            toAreaId: parseAreaId(toAreaId, "toAreaId"),
            toNodeId,
            doorColumn: readNumberProperty(object.properties, "doorColumn", -1),
            doorRow: readNumberProperty(object.properties, "doorRow", -1),
          },
        ];
      },
    ) ?? [];

  return {
    id,
    label: readStringProperty(source.properties, "label"),
    columns: source.width,
    rows: source.height,
    tileWidth: source.tilewidth,
    tileHeight: source.tileheight,
    width: source.width * source.tilewidth,
    height: source.height * source.tileheight,
    spawnNodeId: readStringProperty(source.properties, "spawnNodeId"),
    portalNodeId: readStringProperty(source.properties, "portalNodeId"),
    randomRouteMinDistance: readNumberProperty(
      source.properties,
      "randomRouteMinDistance",
      source.tilewidth * 8,
    ),
    agentHalfWidth: readNumberProperty(source.properties, "agentHalfWidth", 9),
    agentHalfHeight: readNumberProperty(source.properties, "agentHalfHeight", 6),
    groundTiles: [...(getTileLayer(source, HUNTING_TILED_LAYER_NAMES.ground).data ?? [])],
    collisionTiles: [
      ...(getTileLayer(source, HUNTING_TILED_LAYER_NAMES.collision).data ?? []),
    ],
    navigationPoints,
    portals,
  } satisfies HuntingWorldArea;
}

export function getHuntingNavigationPoint(
  area: HuntingWorldArea,
  nodeId: string,
) {
  return area.navigationPoints.find((point) => point.id === nodeId) ?? null;
}

export function getHuntingPortal(area: HuntingWorldArea, nodeId: string) {
  return area.portals.find((portal) => portal.fromNodeId === nodeId) ?? null;
}

function tileIndex(area: HuntingWorldArea, column: number, row: number) {
  return row * area.columns + column;
}

export function isHuntingTileWalkable(
  area: HuntingWorldArea,
  column: number,
  row: number,
) {
  if (column < 0 || row < 0 || column >= area.columns || row >= area.rows) {
    return false;
  }
  const index = tileIndex(area, column, row);
  return area.groundTiles[index] !== 0 && area.collisionTiles[index] === 0;
}

export function worldToHuntingTile(
  area: HuntingWorldArea,
  point: HuntingCoordinate,
) {
  return {
    column: Math.floor(point.x / area.tileWidth),
    row: Math.floor(point.y / area.tileHeight),
  };
}

export function huntingTileCenter(
  area: HuntingWorldArea,
  column: number,
  row: number,
) {
  return {
    x: (column + 0.5) * area.tileWidth,
    y: (row + 0.5) * area.tileHeight,
  };
}

export function isHuntingPointWalkable(
  area: HuntingWorldArea,
  point: HuntingCoordinate,
  clearance = 0,
) {
  const halfWidth = area.agentHalfWidth + clearance;
  const halfHeight = area.agentHalfHeight + clearance;
  const epsilon = 0.001;
  const left = Math.floor((point.x - halfWidth + epsilon) / area.tileWidth);
  const right = Math.floor((point.x + halfWidth - epsilon) / area.tileWidth);
  const top = Math.floor((point.y - halfHeight + epsilon) / area.tileHeight);
  const bottom = Math.floor((point.y + halfHeight - epsilon) / area.tileHeight);
  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      if (!isHuntingTileWalkable(area, column, row)) return false;
    }
  }
  return true;
}

export function resolveHuntingStartingPoint(
  area: HuntingWorldArea,
  pose: { areaId: HuntingAreaId; tileX: number; tileY: number } | null,
): HuntingCoordinate {
  const spawn = getHuntingNavigationPoint(area, area.spawnNodeId);
  if (!spawn) throw new Error(`Spawn ausente em ${area.id}.`);
  if (!pose || pose.areaId !== area.id ||
    !Number.isFinite(pose.tileX) || !Number.isFinite(pose.tileY)) return spawn;
  const requested = { x: pose.tileX * area.tileWidth, y: pose.tileY * area.tileHeight };
  return isHuntingPointWalkable(area, requested) ? requested : spawn;
}

export function isHuntingSegmentWalkable(
  area: HuntingWorldArea,
  from: HuntingCoordinate,
  to: HuntingCoordinate,
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const stepSize = Math.max(2, Math.min(area.tileWidth, area.tileHeight) / 8);
  const steps = Math.max(1, Math.ceil(distance / stepSize));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    if (
      !isHuntingPointWalkable(area, {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      })
    ) {
      return false;
    }
  }
  return true;
}

export function findHuntingCombatFormation(
  area: HuntingWorldArea,
  actor: HuntingCoordinate,
  preferredDirection: HuntingDirection,
  targetDistance = 62,
  approachDistance = 126,
): HuntingCombatFormation {
  const baseAngle = {
    right: 0,
    down: Math.PI / 2,
    left: Math.PI,
    up: -Math.PI / 2,
  }[preferredDirection];
  const angleOffsets = [
    0,
    Math.PI / 4,
    -Math.PI / 4,
    Math.PI / 2,
    -Math.PI / 2,
    (Math.PI * 3) / 4,
    (-Math.PI * 3) / 4,
    Math.PI,
  ];
  const targetDistances = [
    targetDistance,
    Math.max(48, targetDistance - 8),
    Math.max(40, targetDistance - 16),
    32,
  ];

  for (const distance of targetDistances) {
    for (const offset of angleOffsets) {
      const angle = baseAngle + offset;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const target = {
        x: actor.x + direction.x * distance,
        y: actor.y + direction.y * distance,
      };
      if (
        !isHuntingPointWalkable(area, target) ||
        !isHuntingSegmentWalkable(area, actor, target)
      ) {
        continue;
      }

      const spawnDistances = [
        approachDistance,
        (approachDistance + distance) / 2,
        distance + 16,
        distance,
      ];
      const spawn = spawnDistances
        .map((spawnDistance) => ({
          x: actor.x + direction.x * spawnDistance,
          y: actor.y + direction.y * spawnDistance,
        }))
        .find(
          (candidate) =>
            isHuntingPointWalkable(area, candidate) &&
            isHuntingSegmentWalkable(area, target, candidate) &&
            isHuntingSegmentWalkable(area, actor, candidate),
        );
      if (spawn) return { target, spawn };
    }
  }

  // O ator sempre ocupa um ponto navegavel. Sobrepor e preferivel a atravessar
  // uma parede caso uma geometria futura nao tenha espaco para a formacao.
  return { target: actor, spawn: actor };
}

function navigationCell(
  area: HuntingWorldArea,
  column: number,
  row: number,
): NavigationCell {
  return { column, row, ...huntingTileCenter(area, column, row) };
}

function findNearestNavigationCell(
  area: HuntingWorldArea,
  point: HuntingCoordinate,
) {
  const origin = worldToHuntingTile(area, point);
  const candidates: NavigationCell[] = [];
  for (let radius = 0; radius <= 6; radius += 1) {
    for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
      for (let column = origin.column - radius; column <= origin.column + radius; column += 1) {
        if (
          Math.max(Math.abs(column - origin.column), Math.abs(row - origin.row)) !==
          radius
        ) {
          continue;
        }
        if (!isHuntingTileWalkable(area, column, row)) continue;
        const candidate = navigationCell(area, column, row);
        if (
          isHuntingPointWalkable(area, candidate) &&
          isHuntingSegmentWalkable(area, point, candidate)
        ) {
          candidates.push(candidate);
        }
      }
    }
    if (candidates.length) break;
  }
  return (
    candidates.sort(
      (left, right) =>
        Math.hypot(left.x - point.x, left.y - point.y) -
        Math.hypot(right.x - point.x, right.y - point.y),
    )[0] ?? null
  );
}

class MinPriorityQueue {
  private readonly values: Array<Readonly<{ key: number; priority: number }>> = [];

  push(key: number, priority: number) {
    this.values.push({ key, priority });
    let index = this.values.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.values[parentIndex].priority <= priority) break;
      this.values[index] = this.values[parentIndex];
      index = parentIndex;
    }
    this.values[index] = { key, priority };
  }

  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || this.values.length === 0 || !last) return first;
    this.values[0] = last;
    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallest = index;
      if (
        leftIndex < this.values.length &&
        this.values[leftIndex].priority < this.values[smallest].priority
      ) {
        smallest = leftIndex;
      }
      if (
        rightIndex < this.values.length &&
        this.values[rightIndex].priority < this.values[smallest].priority
      ) {
        smallest = rightIndex;
      }
      if (smallest === index) break;
      [this.values[index], this.values[smallest]] = [
        this.values[smallest],
        this.values[index],
      ];
      index = smallest;
    }
    return first;
  }

  get size() {
    return this.values.length;
  }
}

const CARDINAL_NEIGHBORS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export function findHuntingPath(
  area: HuntingWorldArea,
  start: HuntingCoordinate,
  destination: HuntingCoordinate,
) {
  if (!isHuntingPointWalkable(area, start) || !isHuntingPointWalkable(area, destination)) {
    return [];
  }
  const startCell = findNearestNavigationCell(area, start);
  const destinationCell = findNearestNavigationCell(area, destination);
  if (!startCell || !destinationCell) return [];

  const startKey = tileIndex(area, startCell.column, startCell.row);
  const destinationKey = tileIndex(area, destinationCell.column, destinationCell.row);
  const open = new MinPriorityQueue();
  const previous = new Map<number, number>();
  const cost = new Map<number, number>([[startKey, 0]]);
  open.push(startKey, 0);

  while (open.size > 0) {
    const currentEntry = open.pop();
    if (!currentEntry) break;
    if (currentEntry.key === destinationKey) break;
    const currentColumn = currentEntry.key % area.columns;
    const currentRow = Math.floor(currentEntry.key / area.columns);
    for (const [columnOffset, rowOffset] of CARDINAL_NEIGHBORS) {
      const column = currentColumn + columnOffset;
      const row = currentRow + rowOffset;
      if (!isHuntingTileWalkable(area, column, row)) continue;
      const center = huntingTileCenter(area, column, row);
      if (!isHuntingPointWalkable(area, center)) continue;
      const neighborKey = tileIndex(area, column, row);
      const nextCost = (cost.get(currentEntry.key) ?? Number.POSITIVE_INFINITY) + 1;
      if (nextCost >= (cost.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cost.set(neighborKey, nextCost);
      previous.set(neighborKey, currentEntry.key);
      const heuristic =
        Math.abs(destinationCell.column - column) +
        Math.abs(destinationCell.row - row);
      open.push(neighborKey, nextCost + heuristic);
    }
  }

  if (startKey !== destinationKey && !previous.has(destinationKey)) return [];
  const cellKeys = [destinationKey];
  let cursor = destinationKey;
  while (cursor !== startKey) {
    const parent = previous.get(cursor);
    if (parent === undefined) return [];
    cellKeys.unshift(parent);
    cursor = parent;
  }
  const path = cellKeys.map((key) =>
    huntingTileCenter(area, key % area.columns, Math.floor(key / area.columns)),
  );
  if (Math.hypot(path[0].x - start.x, path[0].y - start.y) > 0.01) path.unshift(start);
  const last = path[path.length - 1];
  if (Math.hypot(last.x - destination.x, last.y - destination.y) > 0.01) {
    path.push(destination);
  }
  return path;
}

export function chooseRandomHuntingDestination(
  area: HuntingWorldArea,
  start: HuntingCoordinate,
  random: () => number = Math.random,
) {
  const reachable = area.navigationPoints.filter(
    (point) =>
      point.isDestination &&
      point.id !== area.portalNodeId &&
      findHuntingPath(area, start, point).length >= 2,
  );
  const distant = reachable.filter(
    (point) =>
      Math.hypot(point.x - start.x, point.y - start.y) >= area.randomRouteMinDistance,
  );
  const destinations = distant.length ? distant : reachable;
  if (!destinations.length) return null;
  const randomValue = Math.max(0, Math.min(0.999999, random()));
  return destinations[Math.floor(randomValue * destinations.length)] ?? null;
}

export function validateHuntingArea(area: HuntingWorldArea) {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (!area.groundTiles.some((tile) => tile !== 0)) errors.push(`${area.id}: sem tiles de chao`);
  if (!area.collisionTiles.some((tile) => tile !== 0)) errors.push(`${area.id}: sem tiles de colisao`);
  for (const point of area.navigationPoints) {
    if (ids.has(point.id)) errors.push(`${area.id}: ponto duplicado ${point.id}`);
    ids.add(point.id);
    if (!isHuntingPointWalkable(area, point)) errors.push(`${area.id}: ponto bloqueado ${point.id}`);
  }
  const spawn = getHuntingNavigationPoint(area, area.spawnNodeId);
  const portal = getHuntingNavigationPoint(area, area.portalNodeId);
  if (!spawn) errors.push(`${area.id}: spawn inexistente`);
  if (!portal) errors.push(`${area.id}: portal inexistente`);
  if (spawn) {
    for (const destination of area.navigationPoints) {
      if (!findHuntingPath(area, spawn, destination).length) {
        errors.push(`${area.id}: sem caminho ate ${destination.id}`);
      }
    }
  }
  for (const entry of area.portals) {
    if (!getHuntingNavigationPoint(area, entry.fromNodeId)) {
      errors.push(`${area.id}: portal sem ponto ${entry.fromNodeId}`);
    }
    if (!Number.isInteger(entry.doorColumn) || !Number.isInteger(entry.doorRow)) {
      errors.push(`${area.id}: portal sem tile de porta ${entry.fromNodeId}`);
    }
  }
  return errors;
}
