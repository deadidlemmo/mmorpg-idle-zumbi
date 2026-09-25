import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, "..");
const SOURCE_DIR = path.join(
  FRONTEND_DIR,
  "src/assets/images/auto-combat/ferrugem/source",
);
const IMAGE_DIR = path.join(
  FRONTEND_DIR,
  "src/assets/images/auto-combat/ferrugem",
);
const MAP_DIR = path.join(FRONTEND_DIR, "src/assets/maps/auto-combat");

const TILE_SIZE = 32;
const MAP_WIDTH = 48;
const MAP_HEIGHT = 32;
const TILE_COUNT = MAP_WIDTH * MAP_HEIGHT;
const MASK_TILESET_NAME = "ferrugem-navigation-mask";
const MASK_IMAGE_NAME = "ferrugem-navigation-mask.png";
const REQUIRED_TILE_LAYERS = [
  "ground",
  "ground-details",
  "objects-below",
  "collision",
  "walls-fences",
  "doors",
  "objects-above",
  "roofs-occlusion",
];

const emptyLayer = () => Array(TILE_COUNT).fill(0);
const indexAt = (column, row) => row * MAP_WIDTH + column;

function blockRect(layer, x, y, width, height) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if (
        column >= 0 &&
        row >= 0 &&
        column < MAP_WIDTH &&
        row < MAP_HEIGHT
      ) {
        layer[indexAt(column, row)] = 2;
      }
    }
  }
}

function unblockRect(layer, x, y, width, height) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if (
        column >= 0 &&
        row >= 0 &&
        column < MAP_WIDTH &&
        row < MAP_HEIGHT
      ) {
        layer[indexAt(column, row)] = 0;
      }
    }
  }
}

function point(id, name, column, row, destination = true) {
  return {
    id,
    name,
    point: true,
    x: (column + 0.5) * TILE_SIZE,
    y: (row + 0.5) * TILE_SIZE,
    width: 0,
    height: 0,
    rotation: 0,
    type: "navigation",
    visible: true,
    properties: [{ name: "destination", type: "bool", value: destination }],
  };
}

function portal(id, name, nodeId, toAreaId, toNodeId, doorColumn, doorRow, column, row) {
  return {
    id,
    name,
    point: true,
    x: (column + 0.5) * TILE_SIZE,
    y: (row + 0.5) * TILE_SIZE,
    width: 0,
    height: 0,
    rotation: 0,
    type: "portal",
    visible: true,
    properties: [
      { name: "nodeId", type: "string", value: nodeId },
      { name: "toAreaId", type: "string", value: toAreaId },
      { name: "toNodeId", type: "string", value: toNodeId },
      { name: "doorColumn", type: "int", value: doorColumn },
      { name: "doorRow", type: "int", value: doorRow },
    ],
  };
}

function tileLayer(id, name, data, visible = true) {
  return {
    id,
    name,
    type: "tilelayer",
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    x: 0,
    y: 0,
    opacity: 1,
    visible,
    data,
  };
}

function objectLayer(id, name, objects) {
  return {
    id,
    name,
    type: "objectgroup",
    draworder: "topdown",
    opacity: 1,
    visible: true,
    x: 0,
    y: 0,
    objects,
  };
}

function buildMap({ areaId, label, spawnNodeId, portalNodeId, collision, navigation, portals }) {
  const ground = Array(TILE_COUNT).fill(1);
  const emptyLayers = REQUIRED_TILE_LAYERS.slice(1).map(() => emptyLayer());
  emptyLayers[2] = collision;
  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    nextlayerid: 11,
    nextobjectid: 100,
    properties: [
      { name: "agentHalfHeight", type: "float", value: 6 },
      { name: "agentHalfWidth", type: "float", value: 9 },
      { name: "areaId", type: "string", value: areaId },
      { name: "label", type: "string", value: label },
      { name: "portalNodeId", type: "string", value: portalNodeId },
      { name: "randomRouteMinDistance", type: "float", value: 224 },
      { name: "spawnNodeId", type: "string", value: spawnNodeId },
    ],
    layers: [
      tileLayer(1, "ground", ground),
      ...REQUIRED_TILE_LAYERS.slice(1).map((name, index) =>
        tileLayer(index + 2, name, emptyLayers[index], name !== "collision"),
      ),
      objectLayer(9, "entrances-exits", portals),
      objectLayer(10, "navigation-points", navigation),
    ],
    tilesets: [
      {
        columns: 2,
        firstgid: 1,
        image: `../../images/auto-combat/ferrugem/${MASK_IMAGE_NAME}`,
        imageheight: TILE_SIZE,
        imagewidth: TILE_SIZE * 2,
        margin: 0,
        name: MASK_TILESET_NAME,
        spacing: 0,
        tilecount: 2,
        tileheight: TILE_SIZE,
        tilewidth: TILE_SIZE,
        type: "tileset",
        version: "1.10",
      },
    ],
  };
}

function buildExterior() {
  const collision = emptyLayer();
  blockRect(collision, 0, 0, MAP_WIDTH, 1);
  blockRect(collision, 0, MAP_HEIGHT - 1, MAP_WIDTH, 1);
  blockRect(collision, 0, 0, 1, MAP_HEIGHT);
  blockRect(collision, MAP_WIDTH - 1, 0, 1, MAP_HEIGHT);
  blockRect(collision, 12, 0, 25, 7);
  unblockRect(collision, 23, 6, 5, 2);
  blockRect(collision, 1, 7, 6, 12);
  blockRect(collision, 14, 10, 12, 5);
  blockRect(collision, 35, 8, 12, 4);
  blockRect(collision, 29, 15, 12, 6);
  blockRect(collision, 1, 23, 16, 8);
  blockRect(collision, 29, 25, 18, 6);
  blockRect(collision, 37, 20, 10, 4);
  blockRect(collision, 18, 27, 4, 4);
  return buildMap({
    areaId: "distrito-ferrugem",
    label: "Distrito da Ferrugem - Pátio de Carga",
    spawnNodeId: "patio-sul",
    portalNodeId: "galpao-entrada",
    collision,
    navigation: [
      point(1, "patio-sul", 24, 28),
      point(2, "trilhos-oeste", 9, 19),
      point(3, "carga-central", 25, 21),
      point(4, "oficina-leste", 43, 15),
      point(5, "linha-norte", 31, 8),
      point(6, "galpao-entrada", 25, 8, false),
    ],
    portals: [
      portal(
        7,
        "entrada-linha-prensas",
        "galpao-entrada",
        "galpao-ferrugem",
        "saida",
        25,
        6,
        25,
        8,
      ),
    ],
  });
}

function buildInterior() {
  const collision = emptyLayer();
  blockRect(collision, 0, 0, MAP_WIDTH, 2);
  blockRect(collision, 0, MAP_HEIGHT - 1, MAP_WIDTH, 1);
  blockRect(collision, 0, 0, 1, MAP_HEIGHT);
  blockRect(collision, MAP_WIDTH - 1, 0, 1, MAP_HEIGHT);
  blockRect(collision, 15, 4, 6, 10);
  blockRect(collision, 23, 4, 6, 10);
  blockRect(collision, 31, 4, 6, 10);
  blockRect(collision, 1, 10, 8, 17);
  blockRect(collision, 18, 15, 13, 9);
  blockRect(collision, 35, 13, 9, 9);
  blockRect(collision, 1, 27, 12, 4);
  blockRect(collision, 31, 25, 16, 6);
  blockRect(collision, 13, 27, 7, 4);
  blockRect(collision, 28, 28, 3, 3);
  unblockRect(collision, 23, 30, 5, 2);
  return buildMap({
    areaId: "galpao-ferrugem",
    label: "Linha de Prensas - Galpão do Capataz",
    spawnNodeId: "saida",
    portalNodeId: "saida",
    collision,
    navigation: [
      point(1, "saida", 25, 28, false),
      point(2, "corredor-sul", 23, 25),
      point(3, "prensas-oeste", 12, 16),
      point(4, "prensas-norte", 12, 7),
      point(5, "linha-norte", 39, 8),
      point(6, "maquinas-leste", 44, 23),
      point(7, "centro-operacional", 33, 24),
    ],
    portals: [
      portal(
        8,
        "saida-patio-carga",
        "saida",
        "distrito-ferrugem",
        "galpao-entrada",
        25,
        30,
        25,
        28,
      ),
    ],
  });
}

async function buildMask() {
  const data = Buffer.alloc(TILE_SIZE * 2 * TILE_SIZE * 4);
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = TILE_SIZE; x < TILE_SIZE * 2; x += 1) {
      const offset = (y * TILE_SIZE * 2 + x) * 4;
      data[offset] = 207;
      data[offset + 1] = 63;
      data[offset + 2] = 54;
      data[offset + 3] = 190;
    }
  }
  await sharp(data, {
    raw: { width: TILE_SIZE * 2, height: TILE_SIZE, channels: 4 },
  })
    .png()
    .toFile(path.join(IMAGE_DIR, MASK_IMAGE_NAME));
}

async function optimizeBackground(sourceName, outputName) {
  const source = path.join(SOURCE_DIR, sourceName);
  const metadata = await sharp(source).metadata();
  if (metadata.width !== MAP_WIDTH * TILE_SIZE || metadata.height !== MAP_HEIGHT * TILE_SIZE) {
    throw new Error(`${sourceName} deve medir 1536x1024 pixels.`);
  }
  await sharp(source)
    .webp({ quality: 90, smartSubsample: true })
    .toFile(path.join(IMAGE_DIR, outputName));
}

await fs.mkdir(IMAGE_DIR, { recursive: true });
await fs.mkdir(MAP_DIR, { recursive: true });
await Promise.all([
  buildMask(),
  optimizeBackground("distrito-ferrugem-exterior-source.png", "distrito-ferrugem-exterior.webp"),
  optimizeBackground("distrito-ferrugem-interior-source.png", "distrito-ferrugem-interior.webp"),
  fs.writeFile(
    path.join(MAP_DIR, "distrito-ferrugem-t2-exterior.tmj"),
    `${JSON.stringify(buildExterior(), null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(MAP_DIR, "distrito-ferrugem-t2-interior.tmj"),
    `${JSON.stringify(buildInterior(), null, 2)}\n`,
  ),
]);

console.log("Mapas do Distrito da Ferrugem gerados.");
