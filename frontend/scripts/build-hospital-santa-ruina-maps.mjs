import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageDir = path.join(frontendRoot, "src/assets/images/auto-combat/hospital");
const sourceDir = path.join(imageDir, "source");
const mapDir = path.join(frontendRoot, "src/assets/maps/auto-combat");
const tileSize = 32;
const columns = 48;
const rows = 32;
const layerNames = [
  "ground", "ground-details", "objects-below", "collision",
  "walls-fences", "doors", "objects-above", "roofs-occlusion",
];

const blank = () => Array(columns * rows).fill(0);
const indexAt = (x, y) => y * columns + x;

function paintRect(layer, x, y, width, height, value = 2) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      if (column >= 0 && column < columns && row >= 0 && row < rows) {
        layer[indexAt(column, row)] = value;
      }
    }
  }
}

function point(id, name, column, row, destination = true) {
  return {
    id, name, type: "navigation", point: true, visible: true,
    x: (column + 0.5) * tileSize,
    y: (row + 0.5) * tileSize,
    width: 0, height: 0, rotation: 0,
    properties: [{ name: "destination", type: "bool", value: destination }],
  };
}

function portal(id, name, nodeId, toAreaId, toNodeId, doorColumn, doorRow, column, row) {
  return {
    id, name, type: "portal", point: true, visible: true,
    x: (column + 0.5) * tileSize,
    y: (row + 0.5) * tileSize,
    width: 0, height: 0, rotation: 0,
    properties: [
      { name: "nodeId", type: "string", value: nodeId },
      { name: "toAreaId", type: "string", value: toAreaId },
      { name: "toNodeId", type: "string", value: toNodeId },
      { name: "doorColumn", type: "int", value: doorColumn },
      { name: "doorRow", type: "int", value: doorRow },
    ],
  };
}

function objectLayer(id, name, objects) {
  return {
    id, name, type: "objectgroup", draworder: "topdown", opacity: 1,
    visible: true, x: 0, y: 0, objects,
  };
}

function buildMap({ areaId, label, spawnNodeId, portalNodeId, collision, navigation, portals }) {
  return {
    type: "map", version: "1.10", tiledversion: "1.10.2",
    orientation: "orthogonal", renderorder: "right-down", infinite: false,
    width: columns, height: rows, tilewidth: tileSize, tileheight: tileSize,
    nextlayerid: 11, nextobjectid: 100,
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
      ...layerNames.map((name, index) => ({
        id: index + 1, name, type: "tilelayer", width: columns, height: rows,
        x: 0, y: 0, opacity: 1, visible: name !== "collision",
        data: name === "ground" ? Array(columns * rows).fill(1)
          : name === "collision" ? collision : blank(),
      })),
      objectLayer(9, "entrances-exits", portals),
      objectLayer(10, "navigation-points", navigation),
    ],
    tilesets: [{
      columns: 2, firstgid: 1,
      image: "../../images/auto-combat/hospital/hospital-navigation-mask.png",
      imageheight: tileSize, imagewidth: tileSize * 2,
      margin: 0, spacing: 0, name: "hospital-navigation-mask",
      tilecount: 2, tileheight: tileSize, tilewidth: tileSize,
      type: "tileset", version: "1.10",
    }],
  };
}

function buildExterior() {
  const collision = blank();
  paintRect(collision, 0, 0, columns, 8); // facade, wings and roof
  paintRect(collision, 21, 6, 6, 3, 0); // emergency entrance
  paintRect(collision, 0, 0, 1, rows);
  paintRect(collision, columns - 1, 0, 1, rows);
  paintRect(collision, 0, rows - 1, columns, 1);
  paintRect(collision, 1, 8, 11, 5); // west ambulance bay
  paintRect(collision, 1, 14, 11, 11); // field hospital and vehicles
  paintRect(collision, 2, 25, 9, 4);
  paintRect(collision, 36, 8, 11, 5); // east ambulance bay
  paintRect(collision, 36, 14, 11, 11);
  paintRect(collision, 38, 25, 9, 4);
  paintRect(collision, 17, 13, 14, 6); // planted triage island
  paintRect(collision, 1, 26, 18, 3); // south perimeter fence
  paintRect(collision, 29, 26, 18, 3);
  return buildMap({
    areaId: "hospital-patio", label: "Hospital Santa Ruína - Triagem Vazia",
    spawnNodeId: "portao-sul", portalNodeId: "entrada-emergencia", collision,
    navigation: [
      point(1, "portao-sul", 24, 29),
      point(2, "rotatoria-sul", 24, 22),
      point(3, "triagem-oeste", 14, 21),
      point(4, "ambulancias-oeste", 15, 11),
      point(5, "triagem-leste", 33, 21),
      point(6, "ambulancias-leste", 33, 11),
      point(7, "entrada-emergencia", 24, 9, false),
    ],
    portals: [portal(8, "entrada-ala-isolamento", "entrada-emergencia",
      "hospital-interior", "saida-patio", 24, 7, 24, 9)],
  });
}

function buildInterior() {
  const collision = blank();
  paintRect(collision, 0, 0, columns, 9); // sealed surgery and laboratory rooms
  paintRect(collision, 0, 0, 2, rows);
  paintRect(collision, 46, 0, 2, rows);
  paintRect(collision, 0, 30, columns, 2);
  paintRect(collision, 21, 30, 6, 2, 0); // exit threshold
  paintRect(collision, 14, 9, 2, 20); // triage wall
  paintRect(collision, 14, 19, 2, 3, 0); // triage doorway
  paintRect(collision, 32, 9, 2, 20); // isolation wall
  paintRect(collision, 32, 19, 2, 3, 0); // isolation doorway
  paintRect(collision, 19, 14, 10, 5); // reception island
  paintRect(collision, 2, 14, 10, 4); // overturned triage equipment
  paintRect(collision, 3, 24, 8, 4);
  paintRect(collision, 36, 12, 10, 6); // isolation beds
  paintRect(collision, 36, 23, 10, 5);
  paintRect(collision, 0, 29, 20, 1);
  paintRect(collision, 28, 29, 20, 1);
  return buildMap({
    areaId: "hospital-interior", label: "Ala de Isolamento - Centro Cirúrgico",
    spawnNodeId: "saida-patio", portalNodeId: "saida-patio", collision,
    navigation: [
      point(1, "saida-patio", 24, 27, false),
      point(2, "sala-central", 24, 23),
      point(3, "triagem-oeste", 11, 21),
      point(4, "enfermaria-oeste", 11, 12),
      point(5, "isolamento-leste", 37, 21),
      point(6, "ala-norte", 24, 11),
      point(7, "corredor-leste", 37, 10),
    ],
    portals: [portal(8, "saida-triagem", "saida-patio", "hospital-patio",
      "entrada-emergencia", 24, 30, 24, 27)],
  });
}

async function buildMask() {
  const pixels = Buffer.alloc(tileSize * tileSize * 2 * 4);
  for (let row = 0; row < tileSize; row += 1) {
    for (let column = tileSize; column < tileSize * 2; column += 1) {
      const offset = (row * tileSize * 2 + column) * 4;
      pixels[offset] = 207;
      pixels[offset + 1] = 63;
      pixels[offset + 2] = 54;
      pixels[offset + 3] = 190;
    }
  }
  await sharp(pixels, {
    raw: { width: tileSize * 2, height: tileSize, channels: 4 },
  }).png().toFile(path.join(imageDir, "hospital-navigation-mask.png"));
}

async function buildBackground(sourceName, outputName) {
  const source = path.join(sourceDir, sourceName);
  const { width, height } = await sharp(source).metadata();
  if (width !== columns * tileSize || height !== rows * tileSize) {
    throw new Error(`${sourceName} deve medir 1536x1024 pixels.`);
  }
  await sharp(source).webp({ quality: 89, smartSubsample: true })
    .toFile(path.join(imageDir, outputName));
}

await fs.mkdir(imageDir, { recursive: true });
await fs.mkdir(mapDir, { recursive: true });
await Promise.all([
  buildMask(),
  buildBackground("hospital-exterior-source.png", "hospital-exterior.webp"),
  buildBackground("hospital-interior-source.png", "hospital-interior.webp"),
  fs.writeFile(path.join(mapDir, "hospital-santa-ruina-t3-exterior.tmj"),
    `${JSON.stringify(buildExterior(), null, 2)}\n`),
  fs.writeFile(path.join(mapDir, "hospital-santa-ruina-t3-interior.tmj"),
    `${JSON.stringify(buildInterior(), null, 2)}\n`),
]);

console.log("Mapas do Hospital Santa Ruína gerados.");
