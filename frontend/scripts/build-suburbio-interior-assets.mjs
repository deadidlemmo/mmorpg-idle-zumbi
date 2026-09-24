import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, "..");
const SOURCE_DIR = path.join(
  FRONTEND_DIR,
  "src/assets/images/auto-combat/interior/source",
);
const IMAGE_DIR = path.join(
  FRONTEND_DIR,
  "src/assets/images/auto-combat/interior",
);
const MAP_DIR = path.join(FRONTEND_DIR, "src/assets/maps/auto-combat");

const TILE_SIZE = 32;
const MAP_WIDTH = 44;
const MAP_HEIGHT = 28;
const MAP_TILE_COUNT = MAP_WIDTH * MAP_HEIGHT;
const REQUIRED_LAYERS = [
  "ground",
  "ground-details",
  "objects-below",
  "collision",
  "walls-fences",
  "doors",
  "objects-above",
  "roofs-occlusion",
  "entrances-exits",
  "navigation-points",
  "depth-objects",
];

const TILESETS = {
  terrain: {
    columns: 16,
    rows: 4,
    firstgid: 1,
    name: "suburbio-interior-terrain",
    image: "suburbio-interior-terrain.png",
  },
  walls: {
    columns: 16,
    rows: 16,
    firstgid: 65,
    name: "suburbio-interior-walls",
    image: "suburbio-interior-walls.png",
  },
};

const WALL_TILES = {
  horizontal: { x: 0, y: 0, width: 4, height: 2 },
  verticalLeft: { x: 0, y: 2, width: 2, height: 4 },
  verticalRight: { x: 2, y: 2, width: 2, height: 4 },
  doorway: { x: 4, y: 2, width: 3, height: 3 },
  broken: { x: 7, y: 2, width: 3, height: 3 },
  collision: { x: 0, y: 6 },
  closedDoor: { x: 1, y: 6 },
  openDoor: { x: 2, y: 6 },
  shadowDown: { x: 3, y: 6 },
  shadowLeft: { x: 4, y: 6 },
  shadowRight: { x: 5, y: 6 },
};

const tileGid = (tileset, x, y) =>
  tileset.firstgid + y * tileset.columns + x;
const COLLISION_GID = tileGid(
  TILESETS.walls,
  WALL_TILES.collision.x,
  WALL_TILES.collision.y,
);
const CLOSED_DOOR_GID = tileGid(
  TILESETS.walls,
  WALL_TILES.closedDoor.x,
  WALL_TILES.closedDoor.y,
);
const OPEN_DOOR_GID = tileGid(
  TILESETS.walls,
  WALL_TILES.openDoor.x,
  WALL_TILES.openDoor.y,
);
const SHADOW_DOWN_GID = tileGid(
  TILESETS.walls,
  WALL_TILES.shadowDown.x,
  WALL_TILES.shadowDown.y,
);
const SHADOW_LEFT_GID = tileGid(
  TILESETS.walls,
  WALL_TILES.shadowLeft.x,
  WALL_TILES.shadowLeft.y,
);
const SHADOW_RIGHT_GID = tileGid(
  TILESETS.walls,
  WALL_TILES.shadowRight.x,
  WALL_TILES.shadowRight.y,
);

const FURNITURE = [
  {
    name: "sofa",
    crop: { left: 40, top: 32, width: 430, height: 220 },
    width: 192,
    height: 96,
  },
  {
    name: "armchair",
    crop: { left: 500, top: 24, width: 220, height: 230 },
    width: 96,
    height: 96,
  },
  {
    name: "coffee-table",
    crop: { left: 770, top: 50, width: 275, height: 190 },
    width: 128,
    height: 64,
  },
  {
    name: "rug",
    crop: { left: 1090, top: 20, width: 390, height: 250 },
    width: 192,
    height: 128,
  },
  {
    name: "bed",
    crop: { left: 75, top: 255, width: 320, height: 330 },
    width: 192,
    height: 192,
  },
  {
    name: "dresser",
    crop: { left: 470, top: 255, width: 270, height: 270 },
    width: 128,
    height: 96,
  },
  {
    name: "wardrobe",
    crop: { left: 820, top: 255, width: 250, height: 285 },
    width: 128,
    height: 128,
  },
  {
    name: "bookshelf",
    crop: { left: 1195, top: 250, width: 210, height: 300 },
    width: 96,
    height: 160,
  },
  {
    name: "television",
    crop: { left: 90, top: 555, width: 220, height: 235 },
    width: 96,
    height: 96,
  },
  {
    name: "kitchen-table",
    crop: { left: 400, top: 545, width: 340, height: 280 },
    width: 160,
    height: 128,
  },
  {
    name: "counter",
    crop: { left: 760, top: 555, width: 390, height: 220 },
    width: 192,
    height: 64,
  },
  {
    name: "fridge",
    crop: { left: 1220, top: 545, width: 210, height: 260 },
    width: 96,
    height: 128,
  },
  {
    name: "toilet",
    crop: { left: 120, top: 790, width: 150, height: 220 },
    width: 64,
    height: 96,
  },
  {
    name: "bathtub",
    crop: { left: 420, top: 785, width: 330, height: 230 },
    width: 160,
    height: 96,
  },
  {
    name: "sink",
    crop: { left: 840, top: 790, width: 190, height: 210 },
    width: 64,
    height: 64,
  },
  {
    name: "boxes",
    crop: { left: 1150, top: 785, width: 340, height: 225 },
    width: 128,
    height: 96,
  },
];

const ARCHITECTURE_PROPS = [
  {
    name: "door-closed",
    crop: { left: 25, top: 710, width: 190, height: 285 },
    width: 64,
    height: 96,
  },
  {
    name: "door-open",
    crop: { left: 215, top: 710, width: 205, height: 285 },
    width: 64,
    height: 96,
  },
];

const emptyLayer = () => Array(MAP_TILE_COUNT).fill(0);
const indexAt = (x, y) => y * MAP_WIDTH + x;

function setTile(layer, x, y, gid) {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return;
  layer[indexAt(x, y)] = gid;
}

function fillRect(layer, x, y, width, height, value) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      setTile(layer, column, row, value);
    }
  }
}

function fillGround(layer, x, y, width, height, material) {
  const sourceX = material * 4;
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      setTile(
        layer,
        column,
        row,
        tileGid(
          TILESETS.terrain,
          sourceX + ((column - x) % 4),
          (row - y) % 4,
        ),
      );
    }
  }
}

function stampHorizontalWall(layer, mapX, mapY, width) {
  for (let y = 0; y < WALL_TILES.horizontal.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setTile(
        layer,
        mapX + x,
        mapY + y,
        tileGid(
          TILESETS.walls,
          WALL_TILES.horizontal.x + (x % WALL_TILES.horizontal.width),
          WALL_TILES.horizontal.y + y,
        ),
      );
    }
  }
}

function stampVerticalWall(layer, mapX, mapY, height, side = "left") {
  const definition =
    side === "right" ? WALL_TILES.verticalRight : WALL_TILES.verticalLeft;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < definition.width; x += 1) {
      setTile(
        layer,
        mapX + x,
        mapY + y,
        tileGid(
          TILESETS.walls,
          definition.x + x,
          definition.y + (y % definition.height),
        ),
      );
    }
  }
}

function clearRect(layer, x, y, width, height) {
  fillRect(layer, x, y, width, height, 0);
}

async function rawImage(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 4 };
}

function cropRaw(image, { left, top, width, height }) {
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = ((top + y) * image.width + left) * 4;
    const targetOffset = y * width * 4;
    image.data.copy(
      output,
      targetOffset,
      sourceOffset,
      sourceOffset + width * 4,
    );
  }
  return { data: output, width, height, channels: 4 };
}

function clearBorderBackground(image) {
  const { data, width, height } = image;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const isBackground = (pixelIndex) => {
    const offset = pixelIndex * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    return maximum - minimum <= 30 && maximum >= 138;
  };
  const enqueue = (x, y) => {
    const pixelIndex = y * width + x;
    if (visited[pixelIndex] || !isBackground(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[tail] = pixelIndex;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    data[pixelIndex * 4 + 3] = 0;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }
  return image;
}

function alphaBounds(image) {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("Asset interno vazio.");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function fitAsset(source, crop, width, height, padding = 2) {
  const cleared = clearBorderBackground(cropRaw(source, crop));
  const bounds = alphaBounds(cleared);
  const visible = cropRaw(cleared, bounds);
  return sharp(visible.data, {
    raw: {
      width: visible.width,
      height: visible.height,
      channels: 4,
    },
  })
    .resize(width - padding * 2, height - padding * 2, {
      fit: "contain",
      background: "#00000000",
      kernel: sharp.kernel.nearest,
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: "#00000000",
    })
    .png()
    .toBuffer();
}

function makeTileable(input, size, edgeWidth = 10) {
  const output = Buffer.from(input);
  for (let distance = 0; distance < edgeWidth; distance += 1) {
    const blend = 1 - distance / edgeWidth;
    for (let position = 0; position < size; position += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const left = (position * size + distance) * 4 + channel;
        const right =
          (position * size + size - 1 - distance) * 4 + channel;
        const average = (output[left] + output[right]) / 2;
        output[left] = Math.round(output[left] * (1 - blend) + average * blend);
        output[right] = Math.round(
          output[right] * (1 - blend) + average * blend,
        );
        const top = (distance * size + position) * 4 + channel;
        const bottom =
          ((size - 1 - distance) * size + position) * 4 + channel;
        const verticalAverage = (output[top] + output[bottom]) / 2;
        output[top] = Math.round(
          output[top] * (1 - blend) + verticalAverage * blend,
        );
        output[bottom] = Math.round(
          output[bottom] * (1 - blend) + verticalAverage * blend,
        );
      }
    }
  }
  return output;
}

async function buildTerrainAtlas(architecture) {
  const crops = [
    { left: 31, top: 37, width: 345, height: 340 },
    { left: 412, top: 37, width: 340, height: 340 },
    { left: 783, top: 37, width: 344, height: 340 },
    { left: 1159, top: 37, width: 345, height: 340 },
  ];
  const composites = [];
  for (let material = 0; material < crops.length; material += 1) {
    const crop = cropRaw(architecture, crops[material]);
    const macro = await sharp(crop.data, {
      raw: { width: crop.width, height: crop.height, channels: 4 },
    })
      .resize(128, 128, { kernel: sharp.kernel.nearest })
      .raw()
      .toBuffer();
    composites.push({
      input: await sharp(makeTileable(macro, 128), {
        raw: { width: 128, height: 128, channels: 4 },
      })
        .png()
        .toBuffer(),
      left: material * 128,
      top: 0,
    });
  }
  const output = path.join(IMAGE_DIR, TILESETS.terrain.image);
  await sharp({
    create: {
      width: TILESETS.terrain.columns * TILE_SIZE,
      height: TILESETS.terrain.rows * TILE_SIZE,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(composites)
    .png()
    .toFile(output);
  return output;
}

async function buildWallAtlas(architecture) {
  const atlasWidth = TILESETS.walls.columns * TILE_SIZE;
  const atlasHeight = TILESETS.walls.rows * TILE_SIZE;
  const horizontalBase = await fitAsset(
    architecture,
    { left: 38, top: 420, width: 410, height: 260 },
    128,
    64,
    0,
  );
  const seamlessWall = await sharp(horizontalBase)
    .extract({ left: 8, top: 0, width: 112, height: 64 })
    .resize(128, 64, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const horizontal = await sharp(seamlessWall)
    .composite([
      {
        input: Buffer.from(
          `<svg width="128" height="64"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="72%" stop-color="#080604" stop-opacity="0"/><stop offset="100%" stop-color="#080604" stop-opacity=".5"/></linearGradient></defs><rect width="128" height="64" fill="url(#s)"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();
  const verticalBase = await sharp(seamlessWall).rotate(90).png().toBuffer();
  const verticalLeft = await sharp(verticalBase)
    .composite([
      {
        input: Buffer.from(
          `<svg width="64" height="128"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="68%" stop-color="#080604" stop-opacity="0"/><stop offset="100%" stop-color="#080604" stop-opacity=".55"/></linearGradient></defs><rect width="64" height="128" fill="url(#s)"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();
  const verticalRight = await sharp(verticalBase)
    .composite([
      {
        input: Buffer.from(
          `<svg width="64" height="128"><defs><linearGradient id="s" x1="1" y1="0" x2="0" y2="0"><stop offset="68%" stop-color="#080604" stop-opacity="0"/><stop offset="100%" stop-color="#080604" stop-opacity=".55"/></linearGradient></defs><rect width="64" height="128" fill="url(#s)"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();
  const doorway = await fitAsset(
    architecture,
    { left: 1210, top: 410, width: 305, height: 300 },
    96,
    96,
  );
  const broken = await fitAsset(
    architecture,
    { left: 700, top: 720, width: 275, height: 260 },
    96,
    96,
  );
  const collision = Buffer.from(`<svg width="32" height="32"><rect width="32" height="32" fill="#dd2e2e" fill-opacity=".78"/><path d="M3 3l26 26M29 3L3 29" stroke="#fff" stroke-width="2"/></svg>`);
  const transparentDoor = Buffer.from(
    `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"/>`,
  );
  const shadowDown = Buffer.from(
    `<svg width="32" height="32"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#090705" stop-opacity=".42"/><stop offset=".8" stop-color="#090705" stop-opacity="0"/></linearGradient></defs><rect width="32" height="32" fill="url(#s)"/></svg>`,
  );
  const shadowLeft = Buffer.from(
    `<svg width="32" height="32"><defs><linearGradient id="s" x1="1" y1="0" x2="0" y2="0"><stop stop-color="#090705" stop-opacity=".38"/><stop offset=".8" stop-color="#090705" stop-opacity="0"/></linearGradient></defs><rect width="32" height="32" fill="url(#s)"/></svg>`,
  );
  const shadowRight = Buffer.from(
    `<svg width="32" height="32"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#090705" stop-opacity=".38"/><stop offset=".8" stop-color="#090705" stop-opacity="0"/></linearGradient></defs><rect width="32" height="32" fill="url(#s)"/></svg>`,
  );

  const output = path.join(IMAGE_DIR, TILESETS.walls.image);
  await sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite([
      { input: horizontal, left: 0, top: 0 },
      { input: verticalLeft, left: 0, top: 64 },
      { input: verticalRight, left: 64, top: 64 },
      { input: doorway, left: 128, top: 64 },
      { input: broken, left: 224, top: 64 },
      { input: collision, left: 0, top: 192 },
      { input: transparentDoor, left: 32, top: 192 },
      { input: transparentDoor, left: 64, top: 192 },
      { input: shadowDown, left: 96, top: 192 },
      { input: shadowLeft, left: 128, top: 192 },
      { input: shadowRight, left: 160, top: 192 },
    ])
    .png()
    .toFile(output);
  return output;
}

async function buildFurnitureAtlas(furnitureSource, architectureSource) {
  const atlasWidth = 1024;
  const atlasHeight = 512;
  const frames = {};
  const composites = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const assets = [
    ...FURNITURE.map((asset) => ({ ...asset, source: furnitureSource })),
    ...ARCHITECTURE_PROPS.map((asset) => ({
      ...asset,
      source: architectureSource,
    })),
  ];
  for (const asset of assets) {
    if (x + asset.width > atlasWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    if (y + asset.height > atlasHeight) {
      throw new Error(`Atlas de moveis sem espaco para ${asset.name}.`);
    }
    const input = await fitAsset(
      asset.source,
      asset.crop,
      asset.width,
      asset.height,
    );
    composites.push({ input, left: x, top: y });
    frames[asset.name] = {
      frame: { x, y, w: asset.width, h: asset.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: {
        x: 0,
        y: 0,
        w: asset.width,
        h: asset.height,
      },
      sourceSize: { w: asset.width, h: asset.height },
    };
    x += asset.width;
    rowHeight = Math.max(rowHeight, asset.height);
  }
  const image = path.join(IMAGE_DIR, "suburbio-interior-props.png");
  const atlas = path.join(IMAGE_DIR, "suburbio-interior-props.json");
  await sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(composites)
    .png()
    .toFile(image);
  await fs.writeFile(
    atlas,
    `${JSON.stringify(
      {
        frames,
        meta: {
          app: "Dead Idle interior generator",
          version: "1.0",
          image: path.basename(image),
          format: "RGBA8888",
          size: { w: atlasWidth, h: atlasHeight },
          scale: "1",
        },
      },
      null,
      2,
    )}\n`,
  );
  return { image, atlas };
}

function buildMapLayers() {
  const ground = emptyLayer();
  const details = emptyLayer();
  const below = emptyLayer();
  const collision = Array(MAP_TILE_COUNT).fill(COLLISION_GID);
  const walls = emptyLayer();
  const doors = emptyLayer();
  const above = emptyLayer();
  const roofs = emptyLayer();

  fillGround(ground, 0, 0, MAP_WIDTH, MAP_HEIGHT, 3);
  fillGround(ground, 5, 4, 14, 5, 2);
  fillGround(ground, 5, 11, 14, 13, 0);
  fillGround(ground, 21, 4, 2, 20, 0);
  fillGround(ground, 25, 4, 14, 5, 1);
  fillGround(ground, 25, 11, 14, 13, 0);
  fillGround(ground, 21, 24, 2, 2, 3);

  fillRect(collision, 5, 4, 14, 5, 0);
  fillRect(collision, 5, 11, 14, 13, 0);
  fillRect(collision, 21, 4, 2, 20, 0);
  fillRect(collision, 25, 4, 14, 5, 0);
  fillRect(collision, 25, 11, 14, 13, 0);

  for (const opening of [
    { x: 19, y: 7 },
    { x: 19, y: 16 },
    { x: 23, y: 7 },
    { x: 23, y: 16 },
  ]) {
    fillRect(collision, opening.x, opening.y, 2, 2, 0);
  }

  stampHorizontalWall(walls, 3, 2, 38);
  stampHorizontalWall(walls, 3, 24, 38);
  stampVerticalWall(walls, 3, 2, 24, "left");
  stampVerticalWall(walls, 39, 2, 24, "right");
  stampVerticalWall(walls, 19, 4, 20, "right");
  stampVerticalWall(walls, 23, 4, 20, "left");
  stampHorizontalWall(walls, 5, 9, 14);
  stampHorizontalWall(walls, 25, 9, 14);

  clearRect(walls, 19, 7, 2, 2);
  clearRect(walls, 19, 16, 2, 2);
  clearRect(walls, 23, 7, 2, 2);
  clearRect(walls, 23, 16, 2, 2);
  clearRect(walls, 21, 24, 1, 2);
  setTile(doors, 21, 24, CLOSED_DOOR_GID);

  for (let x = 5; x <= 38; x += 1) {
    setTile(details, x, 4, SHADOW_DOWN_GID);
  }
  for (const range of [
    { start: 5, end: 18 },
    { start: 25, end: 38 },
  ]) {
    for (let x = range.start; x <= range.end; x += 1) {
      setTile(details, x, 11, SHADOW_DOWN_GID);
    }
  }
  for (let y = 4; y <= 23; y += 1) {
    setTile(details, 5, y, SHADOW_RIGHT_GID);
    setTile(details, 18, y, SHADOW_LEFT_GID);
    setTile(details, 25, y, SHADOW_RIGHT_GID);
    setTile(details, 38, y, SHADOW_LEFT_GID);
  }
  for (const opening of [
    { x: 18, y: 7 },
    { x: 18, y: 16 },
    { x: 25, y: 7 },
    { x: 25, y: 16 },
  ]) {
    clearRect(details, opening.x, opening.y, 1, 2);
  }

  const block = (x, y, width, height) =>
    fillRect(collision, x, y, width, height, COLLISION_GID);
  block(7, 12, 6, 2);
  block(9, 16, 4, 2);
  block(15, 16, 3, 2);
  block(5, 18, 3, 2);
  block(16, 12, 3, 3);
  block(9, 6, 5, 3);
  block(5, 4, 6, 2);
  block(16, 5, 3, 3);
  block(29, 13, 6, 5);
  block(25, 12, 4, 2);
  block(35, 12, 4, 3);
  block(35, 20, 4, 2);
  block(26, 5, 5, 4);
  block(32, 4, 2, 3);
  block(36, 4, 2, 2);

  return { ground, details, below, collision, walls, doors, above, roofs };
}

function property(name, type, value) {
  return { name, type, value };
}

function pointObject(id, name, type, tileX, tileY, properties = []) {
  return {
    id,
    name,
    point: true,
    properties,
    rotation: 0,
    type,
    visible: true,
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

function furnitureObject(
  id,
  name,
  frame,
  centerColumn,
  baseRow,
  width,
  height,
  depthMode = "y",
) {
  return {
    height,
    id,
    name,
    point: true,
    properties: [
      property("frame", "string", frame),
      property("depthMode", "string", depthMode),
    ],
    rotation: 0,
    type: "furniture",
    visible: true,
    width,
    x: (centerColumn + 0.5) * TILE_SIZE,
    y: baseRow * TILE_SIZE,
  };
}

function tileLayer(id, name, data, visible = true) {
  return {
    data,
    height: MAP_HEIGHT,
    id,
    name,
    opacity: 1,
    type: "tilelayer",
    visible,
    width: MAP_WIDTH,
    x: 0,
    y: 0,
  };
}

function embeddedTileset(tileset, tiles = []) {
  return {
    columns: tileset.columns,
    firstgid: tileset.firstgid,
    image: `../../images/auto-combat/interior/${tileset.image}`,
    imageheight: tileset.rows * TILE_SIZE,
    imagewidth: tileset.columns * TILE_SIZE,
    margin: 0,
    name: tileset.name,
    spacing: 0,
    tilecount: tileset.columns * tileset.rows,
    tileheight: TILE_SIZE,
    tiles,
    tilewidth: TILE_SIZE,
  };
}

function buildTmj(layers) {
  const navigation = [
    pointObject(1, "entrada", "spawn", 21, 23, [
      property("destination", "bool", false),
    ]),
    pointObject(2, "hall-centro", "destination", 21, 14, [
      property("destination", "bool", true),
    ]),
    pointObject(3, "sala-estar", "destination", 14, 22, [
      property("destination", "bool", true),
    ]),
    pointObject(4, "cozinha", "destination", 15, 8, [
      property("destination", "bool", true),
    ]),
    pointObject(5, "banheiro", "destination", 25, 8, [
      property("destination", "bool", true),
    ]),
    pointObject(6, "quarto", "destination", 37, 22, [
      property("destination", "bool", true),
    ]),
  ];
  const portals = [
    pointObject(7, "saida-casa-abandonada", "portal", 21, 23, [
      property("nodeId", "string", "entrada"),
      property("toAreaId", "string", "suburbio"),
      property("toNodeId", "string", "casa-abandonada-porta"),
      property("doorColumn", "int", 21),
      property("doorRow", "int", 24),
    ]),
  ];
  const furniture = [
    furnitureObject(100, "tapete-sala", "rug", 11, 21, 192, 128, "below"),
    furnitureObject(101, "sofa-sala", "sofa", 9, 14, 192, 96),
    furnitureObject(102, "mesa-centro", "coffee-table", 10, 18, 128, 64),
    furnitureObject(103, "poltrona", "armchair", 16, 18, 96, 96),
    furnitureObject(104, "televisao", "television", 6, 20, 96, 96),
    furnitureObject(105, "estante", "bookshelf", 17, 15, 96, 160),
    furnitureObject(106, "mesa-cozinha", "kitchen-table", 11, 9, 160, 128),
    furnitureObject(107, "balcao", "counter", 8, 6, 192, 64),
    furnitureObject(108, "geladeira", "fridge", 17, 8, 96, 128),
    furnitureObject(109, "tapete-quarto", "rug", 32, 22, 192, 128, "below"),
    furnitureObject(110, "cama", "bed", 31, 18, 192, 192),
    furnitureObject(111, "comoda", "dresser", 26, 14, 128, 96),
    furnitureObject(112, "guarda-roupa", "wardrobe", 36, 15, 128, 128),
    furnitureObject(113, "caixas", "boxes", 36, 22, 128, 96),
    furnitureObject(114, "banheira", "bathtub", 28, 9, 160, 96),
    furnitureObject(115, "vaso", "toilet", 32, 7, 64, 96),
    furnitureObject(116, "pia-banheiro", "sink", 36, 6, 64, 64),
    furnitureObject(117, "porta-entrada", "door-closed", 21, 26, 64, 96),
  ];

  const wallTiles = [
    {
      id: WALL_TILES.collision.y * TILESETS.walls.columns,
      properties: [property("collides", "bool", true)],
    },
    {
      id:
        WALL_TILES.closedDoor.y * TILESETS.walls.columns +
        WALL_TILES.closedDoor.x,
      properties: [
        property("door", "bool", true),
        property("collides", "bool", true),
      ],
    },
    {
      id:
        WALL_TILES.openDoor.y * TILESETS.walls.columns +
        WALL_TILES.openDoor.x,
      properties: [
        property("door", "bool", true),
        property("collides", "bool", false),
      ],
    },
  ];

  return {
    compressionlevel: -1,
    height: MAP_HEIGHT,
    infinite: false,
    layers: [
      tileLayer(1, "ground", layers.ground),
      tileLayer(2, "ground-details", layers.details),
      tileLayer(3, "objects-below", layers.below),
      tileLayer(4, "collision", layers.collision, false),
      tileLayer(5, "walls-fences", layers.walls),
      tileLayer(6, "doors", layers.doors),
      tileLayer(7, "objects-above", layers.above),
      tileLayer(8, "roofs-occlusion", layers.roofs),
      {
        draworder: "topdown",
        id: 9,
        name: "entrances-exits",
        objects: portals,
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
      {
        draworder: "topdown",
        id: 10,
        name: "navigation-points",
        objects: navigation,
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
      {
        draworder: "topdown",
        id: 11,
        name: "depth-objects",
        objects: furniture,
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 12,
    nextobjectid: 118,
    orientation: "orthogonal",
    properties: [
      property("agentHalfHeight", "float", 6),
      property("agentHalfWidth", "float", 9),
      property("areaId", "string", "casa-abandonada"),
      property("label", "string", "Casa abandonada - Interior"),
      property("portalNodeId", "string", "entrada"),
      property("randomRouteMinDistance", "float", 160),
      property("spawnNodeId", "string", "entrada"),
    ],
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: TILE_SIZE,
    tilesets: [
      embeddedTileset(TILESETS.terrain),
      embeddedTileset(TILESETS.walls, wallTiles),
    ],
    tilewidth: TILE_SIZE,
    type: "map",
    version: "1.10",
    width: MAP_WIDTH,
  };
}

function neighbours(tile) {
  return [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ].filter(({ x, y }) => x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT);
}

function findRoute(collision, start, goal) {
  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;
  const queue = [start];
  const previous = new Map([[startKey, null]]);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const currentKey = `${current.x},${current.y}`;
    if (currentKey === goalKey) break;
    for (const next of neighbours(current)) {
      const key = `${next.x},${next.y}`;
      if (collision[indexAt(next.x, next.y)] !== 0 || previous.has(key)) continue;
      previous.set(key, currentKey);
      queue.push(next);
    }
  }
  if (!previous.has(goalKey)) return [];
  const route = [];
  let cursor = goalKey;
  while (cursor) {
    const [x, y] = cursor.split(",").map(Number);
    route.push({ x, y });
    cursor = previous.get(cursor);
  }
  return route.reverse();
}

function validateMap(tmj, collision) {
  const names = new Set(tmj.layers.map((layer) => layer.name));
  for (const required of REQUIRED_LAYERS) {
    if (!names.has(required)) throw new Error(`Camada ausente: ${required}.`);
  }
  const navigation = tmj.layers.find(
    (layer) => layer.name === "navigation-points",
  ).objects;
  const points = navigation.map((object) => ({
    name: object.name,
    x: Math.floor(object.x / TILE_SIZE),
    y: Math.floor(object.y / TILE_SIZE),
  }));
  const spawn = points.find((point) => point.name === "entrada");
  for (const point of points) {
    if (collision[indexAt(point.x, point.y)] !== 0) {
      throw new Error(`Ponto bloqueado: ${point.name} (${point.x},${point.y}).`);
    }
    if (!findRoute(collision, spawn, point).length) {
      throw new Error(`Ponto inacessivel: ${point.name}.`);
    }
  }

  const reachable = [];
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (findRoute(collision, spawn, { x, y }).length) reachable.push({ x, y });
    }
  }
  let seed = 0x1de1ca5a;
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const start = reachable[seed % reachable.length];
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const goal = reachable[seed % reachable.length];
    const route = findRoute(collision, start, goal);
    if (!route.length) throw new Error(`Rota interna ${attempt} ausente.`);
    for (let step = 0; step < route.length; step += 1) {
      const tile = route[step];
      if (collision[indexAt(tile.x, tile.y)] !== 0) {
        throw new Error(`Rota interna ${attempt} atravessou ${tile.x},${tile.y}.`);
      }
      if (step > 0) {
        const previous = route[step - 1];
        if (Math.abs(tile.x - previous.x) + Math.abs(tile.y - previous.y) !== 1) {
          throw new Error(`Rota interna ${attempt} possui diagonal.`);
        }
      }
    }
  }
  return { reachable: reachable.length, simulatedRoutes: 3000 };
}

function buildTsx(tileset, tileEntries = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="${tileset.name}" tilewidth="${TILE_SIZE}" tileheight="${TILE_SIZE}" tilecount="${tileset.columns * tileset.rows}" columns="${tileset.columns}">
 <image source="../../images/auto-combat/interior/${tileset.image}" width="${tileset.columns * TILE_SIZE}" height="${tileset.rows * TILE_SIZE}"/>
${tileEntries}</tileset>
`;
}

await fs.mkdir(IMAGE_DIR, { recursive: true });
await fs.mkdir(MAP_DIR, { recursive: true });
const architecture = await rawImage(
  path.join(SOURCE_DIR, "interior-architecture-source.png"),
);
const furnitureSource = await rawImage(
  path.join(SOURCE_DIR, "interior-furniture-source.png"),
);
const [terrainFile, wallFile, props] = await Promise.all([
  buildTerrainAtlas(architecture),
  buildWallAtlas(architecture),
  buildFurnitureAtlas(furnitureSource, architecture),
]);
const layers = buildMapLayers();
const tmj = buildTmj(layers);
const validation = validateMap(tmj, layers.collision);
const wallTileEntries = ` <tile id="${WALL_TILES.collision.y * TILESETS.walls.columns}"><properties><property name="collides" type="bool" value="true"/></properties></tile>
 <tile id="${WALL_TILES.closedDoor.y * TILESETS.walls.columns + WALL_TILES.closedDoor.x}"><properties><property name="door" type="bool" value="true"/><property name="collides" type="bool" value="true"/></properties></tile>
 <tile id="${WALL_TILES.openDoor.y * TILESETS.walls.columns + WALL_TILES.openDoor.x}"><properties><property name="door" type="bool" value="true"/><property name="collides" type="bool" value="false"/></properties></tile>
`;
await Promise.all([
  fs.writeFile(
    path.join(MAP_DIR, "suburbio-silencioso-t1-interior.tmj"),
    `${JSON.stringify(tmj, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(MAP_DIR, "suburbio-interior-terrain.tsx"),
    buildTsx(TILESETS.terrain),
  ),
  fs.writeFile(
    path.join(MAP_DIR, "suburbio-interior-walls.tsx"),
    buildTsx(TILESETS.walls, wallTileEntries),
  ),
]);

console.log(
  JSON.stringify(
    {
      map: `${MAP_WIDTH}x${MAP_HEIGHT}`,
      tileSize: TILE_SIZE,
      validation,
      outputs: {
        terrain: terrainFile,
        walls: wallFile,
        props: props.image,
        propsAtlas: props.atlas,
      },
    },
    null,
    2,
  ),
);
