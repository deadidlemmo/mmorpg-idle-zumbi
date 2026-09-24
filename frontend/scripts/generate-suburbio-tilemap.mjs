import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageDirectory = path.join(root, "src", "assets", "images", "auto-combat");
const mapDirectory = path.join(root, "src", "assets", "maps", "auto-combat");
const tileSize = 32;
const atlasColumns = 8;
const atlasRows = 8;

const tileIds = Object.freeze({
  grass: 0,
  grassAlt: 1,
  road: 2,
  roadCracked: 3,
  sidewalk: 4,
  sidewalkCracked: 5,
  dirt: 6,
  parkPath: 7,
  parking: 8,
  woodFloor: 9,
  tileFloor: 10,
  interiorFloorDamaged: 11,
  brickWall: 12,
  fenceH: 13,
  fenceV: 14,
  carTl: 15,
  carTr: 16,
  carBl: 17,
  carBr: 18,
  houseWall: 19,
  marketWall: 20,
  clinicWall: 21,
  roof: 22,
  roofDamaged: 23,
  roofTrim: 24,
  doorClosed: 25,
  doorOpen: 26,
  window: 27,
  interiorWall: 28,
  interiorWallTop: 29,
  interiorDoorClosed: 30,
  interiorDoorOpen: 31,
  treeTrunk: 32,
  treeCanopy: 33,
  bush: 34,
  tallGrass: 35,
  deadTree: 36,
  debris: 37,
  streetlight: 38,
  blood: 39,
  roadLineH: 40,
  roadLineV: 41,
  pothole: 42,
  mailbox: 43,
  hydrant: 44,
  bench: 45,
  dumpster: 46,
  barricade: 47,
  sandbags: 48,
  warning: 49,
  bed: 50,
  table: 51,
  cabinet: 52,
  couch: 53,
  rug: 54,
  counter: 55,
  shelf: 56,
  trash: 57,
  flowers: 58,
  shadow: 59,
  collision: 60,
  fenceGate: 61,
  porch: 62,
  darkVoid: 63,
});

const gid = (name) => tileIds[name] + 1;
const rect = (x, y, width, height, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${extra}/>`;
const polygon = (points, fill) => `<polygon points="${points}" fill="${fill}"/>`;
const line = (x1, y1, x2, y2, stroke, width = 2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;

function tileGroup(name, background, contents = "") {
  const id = tileIds[name];
  const x = (id % atlasColumns) * tileSize;
  const y = Math.floor(id / atlasColumns) * tileSize;
  return `<g transform="translate(${x} ${y})">${background ? rect(0, 0, 32, 32, background) : ""}${contents}</g>`;
}

function createTilesetSvg() {
  const tiles = [];
  tiles.push(
    tileGroup(
      "grass",
      "#3f6949",
      rect(4, 7, 2, 3, "#587f55") + rect(24, 20, 2, 3, "#31583e") + rect(14, 27, 3, 2, "#52774f"),
    ),
    tileGroup(
      "grassAlt",
      "#456f4c",
      rect(7, 23, 2, 3, "#2f583d") + rect(19, 5, 3, 2, "#63865c") + rect(28, 15, 2, 2, "#345f42"),
    ),
    tileGroup("road", "#4b5050", rect(2, 3, 2, 2, "#555b59") + rect(25, 22, 3, 2, "#3b4141")),
    tileGroup(
      "roadCracked",
      "#494e4e",
      line(4, 8, 13, 12, "#303637", 2) + line(13, 12, 9, 19, "#303637", 2) + line(22, 2, 19, 9, "#5a605e", 1),
    ),
    tileGroup("sidewalk", "#899087", line(0, 15, 32, 15, "#727a73", 1) + line(15, 0, 15, 32, "#727a73", 1)),
    tileGroup(
      "sidewalkCracked",
      "#858c83",
      line(0, 15, 32, 15, "#70776f", 1) + line(15, 0, 15, 32, "#70776f", 1) + line(17, 17, 25, 24, "#555d58", 2),
    ),
    tileGroup("dirt", "#75684a", rect(4, 8, 4, 2, "#8d7a55") + rect(22, 23, 3, 2, "#5d543f") + rect(15, 14, 2, 2, "#98845b")),
    tileGroup("parkPath", "#8a7750", rect(2, 2, 4, 3, "#9d885b") + rect(20, 18, 5, 2, "#6c6047")),
    tileGroup("parking", "#555958", line(0, 30, 32, 30, "#d4c985", 2) + rect(7, 5, 2, 2, "#414746")),
    tileGroup("woodFloor", "#775843", line(0, 8, 32, 8, "#4e3c31", 1) + line(0, 16, 32, 16, "#4e3c31", 1) + line(0, 24, 32, 24, "#4e3c31", 1) + line(11, 0, 11, 8, "#5f4838", 1) + line(23, 8, 23, 16, "#5f4838", 1)),
    tileGroup("tileFloor", "#77756b", line(0, 16, 32, 16, "#5d5c56", 1) + line(16, 0, 16, 32, "#5d5c56", 1)),
    tileGroup("interiorFloorDamaged", "#705442", line(0, 9, 32, 9, "#493a31", 1) + line(4, 23, 14, 19, "#352e29", 2) + rect(23, 4, 5, 3, "#463a31")),
    tileGroup("brickWall", "#67564e", line(0, 8, 32, 8, "#3f3734", 2) + line(0, 17, 32, 17, "#3f3734", 2) + line(0, 26, 32, 26, "#3f3734", 2) + line(10, 0, 10, 8, "#473d39", 1) + line(23, 8, 23, 17, "#473d39", 1)),
    tileGroup("fenceH", null, rect(0, 13, 32, 5, "#9b9076") + rect(3, 8, 4, 18, "#5c5549") + rect(25, 8, 4, 18, "#5c5549") + line(0, 11, 32, 11, "#c0b38e", 2)),
    tileGroup("fenceV", null, rect(13, 0, 5, 32, "#9b9076") + rect(8, 3, 18, 4, "#5c5549") + rect(8, 25, 18, 4, "#5c5549") + line(11, 0, 11, 32, "#c0b38e", 2)),
    tileGroup("carTl", null, rect(4, 7, 28, 25, "#485a5c") + rect(8, 10, 24, 8, "#25383a") + rect(5, 20, 27, 3, "#788382")),
    tileGroup("carTr", null, rect(0, 7, 28, 25, "#485a5c") + rect(0, 10, 24, 8, "#25383a") + rect(0, 20, 27, 3, "#788382") + rect(24, 12, 5, 7, "#b5a25d")),
    tileGroup("carBl", null, rect(4, 0, 28, 21, "#3c4c4e") + rect(7, 17, 8, 8, "#202827") + rect(27, 17, 5, 8, "#202827") + rect(12, 5, 20, 4, "#64706f")),
    tileGroup("carBr", null, rect(0, 0, 28, 21, "#3c4c4e") + rect(0, 17, 5, 8, "#202827") + rect(17, 17, 8, 8, "#202827") + rect(0, 5, 14, 4, "#64706f")),
    tileGroup("houseWall", "#75665a", rect(0, 0, 32, 5, "#413a36") + line(0, 24, 32, 24, "#51463f", 2) + rect(4, 8, 3, 3, "#8b7969")),
    tileGroup("marketWall", "#596967", rect(0, 0, 32, 6, "#2d3939") + rect(4, 11, 24, 5, "#7e2f2f") + rect(6, 12, 20, 2, "#d2c28d")),
    tileGroup("clinicWall", "#d0d1c6", rect(0, 0, 32, 6, "#656c68") + rect(13, 9, 6, 16, "#8f3936") + rect(8, 14, 16, 6, "#8f3936")),
    tileGroup("roof", "#4e5552", line(0, 8, 32, 8, "#2f3634", 2) + line(0, 17, 32, 17, "#2f3634", 2) + line(0, 26, 32, 26, "#2f3634", 2) + rect(4, 2, 7, 3, "#626965")),
    tileGroup("roofDamaged", "#4a504e", line(0, 8, 32, 8, "#2b302f", 2) + polygon("15,6 28,9 23,23 11,20", "#242a29") + rect(18, 11, 4, 4, "#70736b")),
    tileGroup("roofTrim", null, rect(0, 2, 32, 8, "#353b39") + rect(0, 10, 32, 4, "#71746c") + rect(0, 14, 32, 3, "#262c2b")),
    tileGroup("doorClosed", "#5c5149", rect(7, 1, 18, 31, "#49352d") + rect(10, 4, 12, 23, "#61483b") + rect(19, 16, 3, 3, "#bca35d")),
    tileGroup("doorOpen", "#5c5149", rect(4, 1, 5, 31, "#342724") + rect(10, 3, 16, 27, "#171a18") + rect(22, 5, 3, 19, "#6b4d3c")),
    tileGroup("window", null, rect(5, 5, 22, 20, "#283b42") + rect(8, 8, 16, 14, "#708b8f") + line(16, 8, 16, 22, "#252f31", 2) + line(8, 15, 24, 15, "#252f31", 2)),
    tileGroup("interiorWall", "#62554d", rect(0, 0, 32, 5, "#342f2c") + rect(0, 25, 32, 7, "#3b332f") + line(5, 8, 27, 19, "#76665a", 2)),
    tileGroup("interiorWallTop", null, rect(0, 0, 32, 11, "#312c29") + rect(0, 11, 32, 5, "#78685b") + rect(0, 16, 32, 3, "#262321")),
    tileGroup("interiorDoorClosed", "#554940", rect(8, 0, 16, 32, "#4b3429") + rect(18, 15, 3, 3, "#c0a25c")),
    tileGroup("interiorDoorOpen", null, rect(4, 0, 5, 32, "#382b25") + rect(10, 2, 16, 28, "#181918") + rect(22, 4, 3, 22, "#674a39")),
    tileGroup("treeTrunk", null, rect(12, 0, 9, 32, "#5d4534") + rect(8, 22, 17, 7, "#49372c") + rect(16, 3, 3, 22, "#806047")),
    tileGroup("treeCanopy", null, rect(5, 3, 23, 25, "#264f37") + rect(2, 9, 28, 14, "#326342") + rect(9, 0, 15, 30, "#3f754b") + rect(11, 5, 7, 7, "#5b8757") + rect(4, 16, 6, 5, "#1d442f")),
    tileGroup("bush", null, rect(3, 12, 26, 16, "#294e35") + rect(7, 8, 18, 19, "#3c7048") + rect(12, 11, 6, 5, "#62875a")),
    tileGroup("tallGrass", null, line(3, 29, 8, 13, "#658557", 3) + line(10, 30, 14, 8, "#4f784c", 3) + line(18, 30, 22, 11, "#70905d", 3) + line(27, 30, 24, 7, "#3d6944", 3)),
    tileGroup("deadTree", null, rect(14, 9, 7, 23, "#564537") + line(17, 13, 7, 4, "#564537", 4) + line(19, 17, 28, 7, "#564537", 4) + line(10, 31, 24, 31, "#342c27", 3)),
    tileGroup("debris", null, rect(4, 20, 9, 6, "#70675d") + rect(15, 12, 11, 8, "#3e4644") + line(7, 11, 24, 27, "#9b674c", 3)),
    tileGroup("streetlight", null, rect(14, 5, 4, 27, "#303938") + rect(10, 4, 12, 4, "#59615d") + rect(8, 7, 9, 5, "#c6ba76")),
    tileGroup("blood", null, rect(10, 17, 13, 7, "#662e2b") + rect(6, 21, 6, 4, "#552522") + rect(20, 13, 5, 5, "#743330")),
    tileGroup("roadLineH", null, rect(1, 14, 30, 4, "#c7b864")),
    tileGroup("roadLineV", null, rect(14, 1, 4, 30, "#c7b864")),
    tileGroup("pothole", null, rect(5, 12, 22, 10, "#242b2b") + rect(9, 10, 14, 14, "#303737") + rect(12, 14, 8, 5, "#182020")),
    tileGroup("mailbox", null, rect(7, 7, 18, 13, "#3c5556") + rect(11, 20, 5, 12, "#4a4038") + rect(21, 10, 6, 3, "#a04c42")),
    tileGroup("hydrant", null, rect(10, 12, 12, 16, "#9e493d") + rect(7, 15, 18, 6, "#783a34") + rect(12, 7, 8, 6, "#b75a49")),
    tileGroup("bench", null, rect(4, 10, 24, 5, "#77553a") + rect(4, 18, 24, 5, "#664a35") + rect(7, 23, 4, 7, "#353633") + rect(21, 23, 4, 7, "#353633")),
    tileGroup("dumpster", null, rect(3, 9, 26, 19, "#35534a") + rect(2, 6, 28, 6, "#253d38") + line(9, 12, 9, 26, "#607368", 2)),
    tileGroup("barricade", null, line(2, 9, 30, 27, "#775037", 6) + line(2, 27, 30, 9, "#775037", 6) + rect(4, 13, 6, 3, "#d2b95f") + rect(22, 13, 6, 3, "#d2b95f")),
    tileGroup("sandbags", null, rect(2, 18, 13, 8, "#81765b") + rect(16, 18, 14, 8, "#756b54") + rect(8, 11, 15, 8, "#96886a")),
    tileGroup("warning", null, rect(14, 17, 4, 15, "#4b4035") + polygon("16,3 29,23 3,23", "#c7a747") + polygon("16,8 24,20 8,20", "#332e27")),
    tileGroup("bed", null, rect(3, 5, 26, 24, "#493b35") + rect(5, 7, 22, 8, "#c0b5a0") + rect(5, 15, 22, 12, "#6b7069") + rect(18, 18, 8, 6, "#444a47")),
    tileGroup("table", null, rect(4, 7, 24, 18, "#664935") + rect(7, 10, 18, 12, "#805d42") + rect(5, 25, 4, 7, "#3e3028") + rect(23, 25, 4, 7, "#3e3028")),
    tileGroup("cabinet", null, rect(5, 2, 22, 29, "#5e4635") + line(16, 4, 16, 28, "#342a24", 2) + rect(12, 14, 2, 2, "#c0a363") + rect(19, 14, 2, 2, "#c0a363")),
    tileGroup("couch", null, rect(2, 12, 28, 17, "#56554b") + rect(5, 8, 22, 14, "#69685b") + line(16, 11, 16, 25, "#3f403a", 2)),
    tileGroup("rug", null, rect(2, 4, 28, 24, "#653d36") + rect(5, 7, 22, 18, "#8a6651") + rect(8, 10, 16, 12, "#403f38")),
    tileGroup("counter", null, rect(2, 8, 28, 22, "#5a5045") + rect(2, 5, 28, 6, "#93836b") + rect(7, 15, 18, 10, "#3d3934")),
    tileGroup("shelf", null, rect(4, 2, 24, 29, "#4c3d31") + line(6, 10, 26, 10, "#a08765", 3) + line(6, 20, 26, 20, "#a08765", 3) + rect(8, 5, 5, 4, "#65705e") + rect(17, 13, 7, 6, "#8d6249")),
    tileGroup("trash", null, rect(8, 12, 16, 18, "#515a56") + rect(6, 9, 20, 5, "#2e3835") + line(11, 15, 11, 27, "#778078", 2)),
    tileGroup("flowers", null, rect(5, 15, 3, 13, "#4e7847") + rect(15, 11, 3, 17, "#4e7847") + rect(24, 16, 3, 12, "#4e7847") + rect(2, 11, 8, 7, "#d0c46f") + rect(12, 7, 8, 7, "#b65a56") + rect(21, 12, 8, 7, "#d8d0a0")),
    tileGroup("shadow", null, `<ellipse cx="16" cy="24" rx="13" ry="5" fill="#101615" opacity="0.55"/>`),
    tileGroup("collision", null, rect(2, 2, 28, 28, "#d34a43", 'opacity="0.42"') + line(5, 5, 27, 27, "#ffd1c8", 3) + line(27, 5, 5, 27, "#ffd1c8", 3)),
    tileGroup("fenceGate", null, rect(1, 14, 30, 5, "#9b9076") + rect(3, 8, 4, 20, "#5c5549") + rect(25, 8, 4, 20, "#5c5549") + line(7, 11, 25, 22, "#c0b38e", 2)),
    tileGroup("porch", "#6a5540", line(0, 8, 32, 8, "#3f342b", 2) + line(0, 17, 32, 17, "#3f342b", 2) + line(0, 26, 32, 26, "#3f342b", 2)),
    tileGroup("darkVoid", "#101715", rect(3, 3, 26, 26, "#151e1b") + rect(7, 7, 18, 18, "#0b110f")),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${atlasColumns * tileSize}" height="${atlasRows * tileSize}" viewBox="0 0 ${atlasColumns * tileSize} ${atlasRows * tileSize}" shape-rendering="crispEdges">${tiles.join("")}</svg>`;
}

function createCharacterSvg({ infected = false } = {}) {
  const frameWidth = 32;
  const frameHeight = 48;
  const rows = ["down", "left", "right", "up"];
  const frames = [];
  for (let row = 0; row < rows.length; row += 1) {
    for (let frame = 0; frame < 3; frame += 1) {
      const x = frame * frameWidth;
      const y = row * frameHeight;
      const step = frame === 1 ? -2 : frame === 2 ? 2 : 0;
      const direction = rows[row];
      const skin = infected ? "#7e936d" : "#b58a68";
      const jacket = infected ? "#5d594d" : "#48594f";
      const pants = infected ? "#4a403a" : "#373c3a";
      const hair = infected ? "#5d604f" : "#493329";
      let body = rect(10, 14, 12, 18, jacket) + rect(8, 18, 4, 13, jacket) + rect(22, 18, 4, 13, jacket);
      if (direction === "up") {
        body += rect(9, 15, 14, 13, infected ? "#4f4d43" : "#5d654e") + rect(11, 4, 10, 11, hair);
      } else {
        body += rect(11, 4, 10, 10, skin) + rect(10, 2, 12, 6, hair);
      }
      if (direction === "left") body += rect(7, 8, 5, 5, hair) + rect(9, 10, 3, 3, skin);
      if (direction === "right") body += rect(20, 8, 5, 5, hair) + rect(20, 10, 3, 3, skin);
      body += rect(10 + step, 31, 6, 12, pants) + rect(17 - step, 31, 6, 12, pants);
      body += rect(8 + step, 42, 9, 4, "#262a28") + rect(16 - step, 42, 9, 4, "#262a28");
      if (!infected) {
        body += rect(direction === "right" ? 6 : 22, 16, 5, 14, "#66734f");
        body += rect(12, 17, 8, 3, "#77805a");
      } else {
        body += rect(8, 22, 5, 3, "#713b35") + rect(19, 29, 4, 5, "#713b35");
      }
      frames.push(`<g transform="translate(${x} ${y})">${body}</g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="192" viewBox="0 0 96 192" shape-rendering="crispEdges">${frames.join("")}</svg>`;
}

const createData = (width, height, fill = 0) => Array(width * height).fill(fill);
const indexOf = (width, x, y) => y * width + x;

function setCell(data, width, height, x, y, value) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  data[indexOf(width, x, y)] = value;
}

function fillRect(data, width, height, x, y, rectWidth, rectHeight, value) {
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      setCell(data, width, height, column, row, value);
    }
  }
}

function createLayers(width, height, groundFill) {
  return {
    ground: createData(width, height, groundFill),
    groundDetails: createData(width, height),
    objectsBelow: createData(width, height),
    collision: createData(width, height),
    wallsFences: createData(width, height),
    doors: createData(width, height),
    objectsAbove: createData(width, height),
    roofsOcclusion: createData(width, height),
  };
}

function blockCell(layers, width, height, x, y) {
  setCell(layers.collision, width, height, x, y, gid("collision"));
}

function blockRect(layers, width, height, x, y, rectWidth, rectHeight) {
  fillRect(layers.collision, width, height, x, y, rectWidth, rectHeight, gid("collision"));
}

function paintRoad(layers, width, height, x, y, roadWidth, roadHeight) {
  fillRect(layers.ground, width, height, x - 1, y - 1, roadWidth + 2, roadHeight + 2, gid("sidewalk"));
  fillRect(layers.ground, width, height, x, y, roadWidth, roadHeight, gid("road"));
  for (let row = y + 3; row < y + roadHeight - 2; row += 11) {
    for (let column = x + 4; column < x + roadWidth - 2; column += 13) {
      setCell(layers.groundDetails, width, height, column, row, gid("roadCracked"));
    }
  }
  if (roadHeight > roadWidth) {
    const center = x + Math.floor(roadWidth / 2);
    for (let row = y + 2; row < y + roadHeight - 2; row += 3) {
      setCell(layers.groundDetails, width, height, center, row, gid("roadLineV"));
    }
  } else {
    const center = y + Math.floor(roadHeight / 2);
    for (let column = x + 2; column < x + roadWidth - 2; column += 3) {
      setCell(layers.groundDetails, width, height, column, center, gid("roadLineH"));
    }
  }
}

function placeTree(layers, width, height, x, y) {
  setCell(layers.wallsFences, width, height, x, y + 1, gid("treeTrunk"));
  setCell(layers.objectsAbove, width, height, x, y, gid("treeCanopy"));
  blockCell(layers, width, height, x, y);
  blockCell(layers, width, height, x, y + 1);
}

function placeCar(layers, width, height, x, y) {
  setCell(layers.objectsBelow, width, height, x, y, gid("carTl"));
  setCell(layers.objectsBelow, width, height, x + 1, y, gid("carTr"));
  setCell(layers.objectsBelow, width, height, x, y + 1, gid("carBl"));
  setCell(layers.objectsBelow, width, height, x + 1, y + 1, gid("carBr"));
  blockRect(layers, width, height, x, y, 2, 2);
}

function placeBuilding(layers, width, height, options) {
  const { x, y, buildingWidth, buildingHeight, wallTile, doorColumn, damaged = false } = options;
  const wallRow = y + buildingHeight - 1;
  fillRect(layers.roofsOcclusion, width, height, x, y, buildingWidth, buildingHeight - 2, gid(damaged ? "roofDamaged" : "roof"));
  fillRect(layers.roofsOcclusion, width, height, x, y + buildingHeight - 2, buildingWidth, 1, gid("roofTrim"));
  fillRect(layers.wallsFences, width, height, x, wallRow, buildingWidth, 1, gid(wallTile));
  for (let column = x + 3; column < x + buildingWidth - 2; column += 6) {
    setCell(layers.objectsAbove, width, height, column, wallRow, gid("window"));
  }
  setCell(layers.doors, width, height, doorColumn, wallRow, gid("doorClosed"));
  blockRect(layers, width, height, x, y, buildingWidth, buildingHeight);
  return { doorColumn, doorRow: wallRow, approachRow: wallRow + 2 };
}

function pointObject(id, name, column, row, properties = []) {
  return {
    id,
    name,
    point: true,
    properties,
    rotation: 0,
    type: "",
    visible: true,
    x: (column + 0.5) * tileSize,
    y: (row + 0.5) * tileSize,
  };
}

const property = (name, type, value) => ({ name, type, value });

function tileLayer(id, name, width, height, data, visible = true) {
  return {
    data,
    height,
    id,
    name,
    opacity: 1,
    type: "tilelayer",
    visible,
    width,
    x: 0,
    y: 0,
  };
}

function objectLayer(id, name, objects) {
  return {
    draworder: "topdown",
    id,
    name,
    objects,
    opacity: 1,
    type: "objectgroup",
    visible: true,
    x: 0,
    y: 0,
  };
}

function embeddedTileset() {
  return {
    columns: atlasColumns,
    firstgid: 1,
    image: "../../images/auto-combat/suburbio-silencioso-t1-tileset.png",
    imageheight: atlasRows * tileSize,
    imagewidth: atlasColumns * tileSize,
    margin: 0,
    name: "suburbio-silencioso-t1",
    spacing: 0,
    tilecount: atlasColumns * atlasRows,
    tileheight: tileSize,
    tiles: [
      { id: tileIds.collision, properties: [property("collides", "bool", true)] },
      { id: tileIds.doorClosed, properties: [property("door", "bool", true), property("collides", "bool", true)] },
      { id: tileIds.doorOpen, properties: [property("door", "bool", true), property("collides", "bool", false)] },
      { id: tileIds.interiorDoorClosed, properties: [property("door", "bool", true), property("collides", "bool", true)] },
      { id: tileIds.interiorDoorOpen, properties: [property("door", "bool", true), property("collides", "bool", false)] },
    ],
    tilewidth: tileSize,
  };
}

function tiledMap({ width, height, layers, areaId, label, spawnNodeId, portalNodeId, navigationPoints, portals, randomRouteMinDistance }) {
  return {
    compressionlevel: -1,
    height,
    infinite: false,
    layers: [
      tileLayer(1, "ground", width, height, layers.ground),
      tileLayer(2, "ground-details", width, height, layers.groundDetails),
      tileLayer(3, "objects-below", width, height, layers.objectsBelow),
      tileLayer(4, "collision", width, height, layers.collision, false),
      tileLayer(5, "walls-fences", width, height, layers.wallsFences),
      tileLayer(6, "doors", width, height, layers.doors),
      tileLayer(7, "objects-above", width, height, layers.objectsAbove),
      tileLayer(8, "roofs-occlusion", width, height, layers.roofsOcclusion),
      objectLayer(9, "entrances-exits", portals),
      objectLayer(10, "navigation-points", navigationPoints),
    ],
    nextlayerid: 11,
    nextobjectid: Math.max(0, ...navigationPoints.map((entry) => entry.id), ...portals.map((entry) => entry.id)) + 1,
    orientation: "orthogonal",
    properties: [
      property("agentHalfHeight", "float", 6),
      property("agentHalfWidth", "float", 9),
      property("areaId", "string", areaId),
      property("label", "string", label),
      property("portalNodeId", "string", portalNodeId),
      property("randomRouteMinDistance", "float", randomRouteMinDistance),
      property("spawnNodeId", "string", spawnNodeId),
    ],
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: tileSize,
    tilesets: [embeddedTileset()],
    tilewidth: tileSize,
    type: "map",
    version: "1.10",
    width,
  };
}

function createExteriorMap() {
  const width = 192;
  const height = 144;
  const layers = createLayers(width, height, gid("grass"));

  paintRoad(layers, width, height, 86, 2, 20, 140);
  paintRoad(layers, width, height, 18, 31, 158, 14);
  paintRoad(layers, width, height, 18, 98, 158, 14);
  paintRoad(layers, width, height, 27, 31, 16, 81);
  paintRoad(layers, width, height, 150, 31, 16, 81);

  for (let x = 4; x < width - 4; x += 3) {
    placeTree(layers, width, height, x, 1);
    placeTree(layers, width, height, x, height - 3);
  }
  for (let y = 5; y < height - 5; y += 3) {
    placeTree(layers, width, height, 1, y);
    placeTree(layers, width, height, width - 2, y);
  }

  const market = placeBuilding(layers, width, height, {
    x: 49,
    y: 9,
    buildingWidth: 27,
    buildingHeight: 15,
    wallTile: "marketWall",
    doorColumn: 62,
    damaged: true,
  });
  const clinic = placeBuilding(layers, width, height, {
    x: 117,
    y: 9,
    buildingWidth: 27,
    buildingHeight: 15,
    wallTile: "clinicWall",
    doorColumn: 130,
  });
  const abandonedHouse = placeBuilding(layers, width, height, {
    x: 52,
    y: 53,
    buildingWidth: 21,
    buildingHeight: 14,
    wallTile: "houseWall",
    doorColumn: 62,
    damaged: true,
  });
  placeBuilding(layers, width, height, {
    x: 116,
    y: 53,
    buildingWidth: 21,
    buildingHeight: 14,
    wallTile: "houseWall",
    doorColumn: 126,
  });
  placeBuilding(layers, width, height, {
    x: 51,
    y: 116,
    buildingWidth: 22,
    buildingHeight: 14,
    wallTile: "houseWall",
    doorColumn: 62,
  });
  placeBuilding(layers, width, height, {
    x: 117,
    y: 116,
    buildingWidth: 22,
    buildingHeight: 14,
    wallTile: "houseWall",
    doorColumn: 128,
    damaged: true,
  });

  fillRect(layers.ground, width, height, 48, 75, 29, 18, gid("parking"));
  placeCar(layers, width, height, 52, 79);
  placeCar(layers, width, height, 60, 86);
  placeCar(layers, width, height, 70, 78);
  placeCar(layers, width, height, 93, 52);
  placeCar(layers, width, height, 155, 72);

  for (let x = 112; x <= 144; x += 1) {
    if (x < 127 || x > 130) {
      setCell(layers.wallsFences, width, height, x, 49, gid("fenceH"));
      setCell(layers.wallsFences, width, height, x, 88, gid("fenceH"));
      blockCell(layers, width, height, x, 49);
      blockCell(layers, width, height, x, 88);
    }
  }
  for (let y = 50; y < 88; y += 1) {
    setCell(layers.wallsFences, width, height, 112, y, gid("fenceV"));
    setCell(layers.wallsFences, width, height, 144, y, gid("fenceV"));
    blockCell(layers, width, height, 112, y);
    blockCell(layers, width, height, 144, y);
  }
  fillRect(layers.ground, width, height, 127, 50, 4, 39, gid("parkPath"));
  setCell(layers.doors, width, height, 128, 88, gid("fenceGate"));
  setCell(layers.doors, width, height, 129, 88, gid("fenceGate"));
  for (const [x, y] of [[118, 55], [139, 57], [119, 76], [138, 80], [135, 68]]) {
    placeTree(layers, width, height, x, y);
  }
  setCell(layers.objectsBelow, width, height, 123, 67, gid("bench"));
  setCell(layers.objectsBelow, width, height, 136, 73, gid("bench"));
  blockCell(layers, width, height, 123, 67);
  blockCell(layers, width, height, 136, 73);

  for (const [x, y, tile] of [
    [83, 57, "barricade"],
    [108, 104, "sandbags"],
    [45, 102, "dumpster"],
    [169, 41, "debris"],
    [79, 35, "pothole"],
    [100, 121, "debris"],
  ]) {
    setCell(layers.objectsBelow, width, height, x, y, gid(tile));
    blockCell(layers, width, height, x, y);
  }
  for (const [x, y] of [[45, 43], [82, 43], [109, 43], [147, 43], [45, 100], [82, 100], [109, 100], [147, 100]]) {
    setCell(layers.objectsAbove, width, height, x, y, gid("streetlight"));
    blockCell(layers, width, height, x, y);
  }
  for (const [x, y] of [[47, 28], [78, 27], [113, 27], [145, 27], [48, 70], [76, 70], [114, 70], [141, 70], [47, 132], [76, 132], [114, 132], [142, 132]]) {
    placeTree(layers, width, height, x, y);
  }
  for (const [x, y] of [[79, 61], [110, 75], [171, 117], [23, 72], [79, 119], [146, 20]]) {
    setCell(layers.groundDetails, width, height, x, y, gid("tallGrass"));
  }
  for (const [x, y] of [[91, 74], [103, 38], [154, 104]]) {
    setCell(layers.groundDetails, width, height, x, y, gid("blood"));
  }

  fillRect(layers.ground, width, height, market.doorColumn - 1, market.doorRow + 1, 3, 7, gid("dirt"));
  fillRect(layers.ground, width, height, clinic.doorColumn - 1, clinic.doorRow + 1, 3, 7, gid("dirt"));
  fillRect(layers.ground, width, height, abandonedHouse.doorColumn - 1, abandonedHouse.doorRow + 1, 3, 6, gid("dirt"));

  const navigation = [
    ["entrada-sul", 95, 137],
    ["avenida-sul", 95, 119],
    ["anel-sudoeste", 35, 104],
    ["anel-oeste", 35, 70],
    ["anel-noroeste", 35, 38],
    ["comercio-oeste", 61, 38],
    ["avenida-norte", 95, 38],
    ["clinica-leste", 130, 38],
    ["anel-nordeste", 158, 38],
    ["anel-leste", 158, 71],
    ["anel-sudeste", 158, 105],
    ["residencial-sul", 128, 105],
    ["cruzamento-central", 95, 105],
    ["estacionamento", 80, 105],
    ["casa-abandonada-porta", abandonedHouse.doorColumn, abandonedHouse.approachRow],
    ["residencial-norte", 80, 38],
    ["parque-portao", 129, 91],
    ["parque-centro", 129, 69],
    ["beco-oeste", 46, 69],
    ["beco-leste", 146, 69],
  ].map(([name, column, row], offset) =>
    pointObject(100 + offset, name, column, row, [property("destination", "bool", name !== "casa-abandonada-porta")]),
  );
  const portals = [
    pointObject(200, "entrada-casa-abandonada", abandonedHouse.doorColumn, abandonedHouse.approachRow, [
      property("nodeId", "string", "casa-abandonada-porta"),
      property("toAreaId", "string", "casa-abandonada"),
      property("toNodeId", "string", "entrada"),
      property("doorColumn", "int", abandonedHouse.doorColumn),
      property("doorRow", "int", abandonedHouse.doorRow),
    ]),
  ];

  return tiledMap({
    width,
    height,
    layers,
    areaId: "suburbio",
    label: "Suburbio Silencioso - Distrito aberto",
    spawnNodeId: "entrada-sul",
    portalNodeId: "casa-abandonada-porta",
    navigationPoints: navigation,
    portals,
    randomRouteMinDistance: 950,
  });
}

function createInteriorMap() {
  const width = 40;
  const height = 24;
  const layers = createLayers(width, height, gid("darkVoid"));
  fillRect(layers.ground, width, height, 1, 1, 38, 22, gid("woodFloor"));
  fillRect(layers.ground, width, height, 29, 2, 9, 9, gid("tileFloor"));

  for (let x = 0; x < width; x += 1) {
    setCell(layers.wallsFences, width, height, x, 0, gid("interiorWallTop"));
    setCell(layers.wallsFences, width, height, x, height - 1, gid("interiorWall"));
    blockCell(layers, width, height, x, 0);
    blockCell(layers, width, height, x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    setCell(layers.wallsFences, width, height, 0, y, gid("interiorWall"));
    setCell(layers.wallsFences, width, height, width - 1, y, gid("interiorWall"));
    blockCell(layers, width, height, 0, y);
    blockCell(layers, width, height, width - 1, y);
  }
  const entranceColumn = 20;
  setCell(layers.doors, width, height, entranceColumn, height - 1, gid("interiorDoorClosed"));

  for (let y = 1; y < 19; y += 1) {
    if (y === 8) {
      setCell(layers.doors, width, height, 13, y, gid("interiorDoorOpen"));
      continue;
    }
    setCell(layers.wallsFences, width, height, 13, y, gid("interiorWall"));
    blockCell(layers, width, height, 13, y);
  }
  for (let y = 5; y < height - 1; y += 1) {
    if (y === 15) {
      setCell(layers.doors, width, height, 28, y, gid("interiorDoorOpen"));
      continue;
    }
    setCell(layers.wallsFences, width, height, 28, y, gid("interiorWall"));
    blockCell(layers, width, height, 28, y);
  }
  for (let x = 1; x < 13; x += 1) {
    if (x === 6) {
      setCell(layers.doors, width, height, x, 12, gid("interiorDoorOpen"));
      continue;
    }
    setCell(layers.wallsFences, width, height, x, 12, gid("interiorWall"));
    blockCell(layers, width, height, x, 12);
  }

  const furniture = [
    [4, 3, "bed"],
    [9, 4, "cabinet"],
    [4, 16, "couch"],
    [9, 19, "table"],
    [16, 5, "shelf"],
    [23, 8, "counter"],
    [33, 4, "cabinet"],
    [35, 9, "trash"],
    [34, 18, "bed"],
    [24, 20, "table"],
    [17, 14, "couch"],
    [31, 13, "shelf"],
  ];
  for (const [x, y, tile] of furniture) {
    setCell(layers.objectsBelow, width, height, x, y, gid(tile));
    blockCell(layers, width, height, x, y);
  }
  setCell(layers.groundDetails, width, height, 20, 18, gid("rug"));
  setCell(layers.groundDetails, width, height, 6, 8, gid("blood"));
  setCell(layers.groundDetails, width, height, 24, 4, gid("debris"));
  setCell(layers.objectsAbove, width, height, 20, 2, gid("streetlight"));
  blockCell(layers, width, height, 20, 2);

  const navigation = [
    ["entrada", 20, 21],
    ["hall-centro", 20, 16],
    ["corredor-norte", 20, 8],
    ["quarto-norte", 6, 8],
    ["quarto-sul-oeste", 6, 17],
    ["cozinha-nordeste", 34, 12],
    ["quarto-sudeste", 34, 20],
    ["sala-sul-oeste", 16, 21],
  ].map(([name, column, row], offset) =>
    pointObject(300 + offset, name, column, row, [property("destination", "bool", name !== "entrada")]),
  );
  const portals = [
    pointObject(400, "saida-casa-abandonada", entranceColumn, 21, [
      property("nodeId", "string", "entrada"),
      property("toAreaId", "string", "suburbio"),
      property("toNodeId", "string", "casa-abandonada-porta"),
      property("doorColumn", "int", entranceColumn),
      property("doorRow", "int", height - 1),
    ]),
  ];

  return tiledMap({
    width,
    height,
    layers,
    areaId: "casa-abandonada",
    label: "Casa abandonada - Interior",
    spawnNodeId: "entrada",
    portalNodeId: "entrada",
    navigationPoints: navigation,
    portals,
    randomRouteMinDistance: 220,
  });
}

function createTsx() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="suburbio-silencioso-t1" tilewidth="32" tileheight="32" tilecount="64" columns="8">
 <image source="../../images/auto-combat/suburbio-silencioso-t1-tileset.png" width="256" height="256"/>
 <tile id="${tileIds.collision}"><properties><property name="collides" type="bool" value="true"/></properties></tile>
 <tile id="${tileIds.doorClosed}"><properties><property name="door" type="bool" value="true"/><property name="collides" type="bool" value="true"/></properties></tile>
 <tile id="${tileIds.doorOpen}"><properties><property name="door" type="bool" value="true"/><property name="collides" type="bool" value="false"/></properties></tile>
 <tile id="${tileIds.interiorDoorClosed}"><properties><property name="door" type="bool" value="true"/><property name="collides" type="bool" value="true"/></properties></tile>
 <tile id="${tileIds.interiorDoorOpen}"><properties><property name="door" type="bool" value="true"/><property name="collides" type="bool" value="false"/></properties></tile>
</tileset>
`;
}

async function main() {
  await mkdir(imageDirectory, { recursive: true });
  await mkdir(mapDirectory, { recursive: true });
  await Promise.all([
    sharp(Buffer.from(createTilesetSvg())).png({ palette: true }).toFile(path.join(imageDirectory, "suburbio-silencioso-t1-tileset.png")),
    sharp(Buffer.from(createCharacterSvg())).png({ palette: true }).toFile(path.join(imageDirectory, "suburbio-silencioso-t1-survivor-gba.png")),
    sharp(Buffer.from(createCharacterSvg({ infected: true }))).png({ palette: true }).toFile(path.join(imageDirectory, "suburbio-silencioso-t1-infected-gba.png")),
    writeFile(path.join(mapDirectory, "suburbio-silencioso-t1.tsx"), createTsx(), "utf8"),
    writeFile(path.join(mapDirectory, "suburbio-silencioso-t1-exterior.tmj"), JSON.stringify(createExteriorMap()), "utf8"),
    writeFile(path.join(mapDirectory, "suburbio-silencioso-t1-interior.tmj"), JSON.stringify(createInteriorMap()), "utf8"),
  ]);
}

await main();
