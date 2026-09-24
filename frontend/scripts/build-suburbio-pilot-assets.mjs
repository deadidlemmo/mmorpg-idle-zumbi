import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, "..");
const SOURCE_DIR = path.join(
  FRONTEND_DIR,
  "src/assets/images/auto-combat/pilot/source",
);
const IMAGE_DIR = path.join(
  FRONTEND_DIR,
  "src/assets/images/auto-combat/pilot",
);
const MAP_DIR = path.join(FRONTEND_DIR, "src/assets/maps/auto-combat");

const TILE_SIZE = 32;
const MAP_WIDTH = 48;
const MAP_HEIGHT = 32;
const MAP_PIXELS = {
  width: MAP_WIDTH * TILE_SIZE,
  height: MAP_HEIGHT * TILE_SIZE,
};

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
];

const TILESETS = {
  terrain: { firstgid: 1, columns: 16, rows: 13 },
  props: { firstgid: 209, columns: 16, rows: 10 },
  environment: { firstgid: 369, columns: 18, rows: 13 },
  houseOne: { firstgid: 603, columns: 36, rows: 10 },
  houseTwo: { firstgid: 963, columns: 42, rows: 12 },
};

const emptyLayer = () => Array(MAP_WIDTH * MAP_HEIGHT).fill(0);
const indexAt = (x, y) => y * MAP_WIDTH + x;
const tileGid = (tileset, x, y) => tileset.firstgid + y * tileset.columns + x;

function setTile(layer, x, y, gid) {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return;
  layer[indexAt(x, y)] = gid;
}

function stampTiles(
  layer,
  mapX,
  mapY,
  tileset,
  sourceX,
  sourceY,
  width,
  height,
) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setTile(
        layer,
        mapX + x,
        mapY + y,
        tileGid(tileset, sourceX + x, sourceY + y),
      );
    }
  }
}

function blockRect(collision, x, y, width, height) {
  const collisionGid = tileGid(TILESETS.terrain, 0, 0);
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      setTile(collision, column, row, collisionGid);
    }
  }
}

function unblock(collision, x, y) {
  setTile(collision, x, y, 0);
}

async function rawImage(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function cropRaw(image, left, top, width, height) {
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
    return maximum - minimum <= 26 && maximum >= 142;
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
    const offset = pixelIndex * 4;
    data[offset + 3] = 0;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  return image;
}

function clearBrightNeutralPixels(image) {
  const { data, width, height } = image;
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    if (maximum >= 178 && maximum - minimum <= 22) data[offset + 3] = 0;
  }
  return image;
}

function alphaBounds(image, threshold = 8) {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] <= threshold) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) {
    throw new Error("Nenhum pixel visivel encontrado durante o recorte.");
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function containInSlot(image, slotWidth, slotHeight, padding = 4) {
  const bounds = alphaBounds(image);
  const cropped = cropRaw(
    image,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
  );
  const maximumWidth = slotWidth - padding * 2;
  const maximumHeight = slotHeight - padding * 2;
  const scale = Math.min(
    maximumWidth / cropped.width,
    maximumHeight / cropped.height,
  );
  const width = Math.max(1, Math.round(cropped.width * scale));
  const height = Math.max(1, Math.round(cropped.height * scale));
  const resized = await sharp(cropped.data, {
    raw: { width: cropped.width, height: cropped.height, channels: 4 },
  })
    .resize(width, height, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  return {
    input: resized,
    left: Math.floor((slotWidth - width) / 2),
    top: slotHeight - height - padding,
    width,
    height,
  };
}

function createTransparentTile() {
  return Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
}

function paintPixel(tile, x, y, color) {
  if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
  const offset = (y * TILE_SIZE + x) * 4;
  tile[offset] = color[0];
  tile[offset + 1] = color[1];
  tile[offset + 2] = color[2];
  tile[offset + 3] = color[3] ?? 255;
}

function paintRect(tile, left, top, width, height, color) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) paintPixel(tile, x, y, color);
  }
}

function buildTransparentDetailTiles() {
  const tiles = Array.from({ length: 8 }, createTransparentTile);
  const curbHighlight = [142, 139, 123, 255];
  const curbMid = [91, 91, 82, 255];
  const curbDark = [45, 48, 45, 255];

  paintRect(tiles[0], 0, 25, TILE_SIZE, 1, curbHighlight);
  paintRect(tiles[0], 0, 26, TILE_SIZE, 3, curbMid);
  paintRect(tiles[0], 0, 29, TILE_SIZE, 3, curbDark);
  paintRect(tiles[0], 0, 25, 1, 7, [51, 53, 49, 220]);
  paintRect(tiles[1], 0, 0, TILE_SIZE, 3, curbDark);
  paintRect(tiles[1], 0, 3, TILE_SIZE, 3, curbMid);
  paintRect(tiles[1], 0, 6, TILE_SIZE, 1, curbHighlight);
  paintRect(tiles[1], 0, 0, 1, 7, [51, 53, 49, 220]);
  paintRect(tiles[2], 25, 0, 1, TILE_SIZE, curbHighlight);
  paintRect(tiles[2], 26, 0, 3, TILE_SIZE, curbMid);
  paintRect(tiles[2], 29, 0, 3, TILE_SIZE, curbDark);
  paintRect(tiles[3], 0, 0, 3, TILE_SIZE, curbDark);
  paintRect(tiles[3], 3, 0, 3, TILE_SIZE, curbMid);
  paintRect(tiles[3], 6, 0, 1, TILE_SIZE, curbHighlight);

  paintRect(tiles[4], 4, 14, 24, 4, [183, 178, 151, 220]);
  paintRect(tiles[4], 5, 15, 22, 1, [215, 207, 171, 235]);
  paintRect(tiles[5], 5, 10, 22, 13, [32, 34, 32, 245]);
  paintRect(tiles[5], 7, 12, 18, 9, [78, 75, 64, 255]);
  for (let x = 9; x <= 23; x += 4)
    paintRect(tiles[5], x, 12, 2, 9, [25, 27, 26, 255]);

  for (let y = 6; y <= 26; y += 1) {
    for (let x = 4; x <= 28; x += 1) {
      const dx = (x - 16) / 12;
      const dy = (y - 16) / 9;
      const noise = ((x * 17 + y * 31) % 11) / 30;
      const distance = dx * dx + dy * dy + noise;
      if (distance < 0.72) paintPixel(tiles[6], x, y, [29, 29, 27, 238]);
      else if (distance < 0.92) paintPixel(tiles[6], x, y, [91, 76, 57, 210]);
    }
  }

  const weed = [91, 112, 39, 240];
  const weedLight = [131, 139, 58, 230];
  for (const [x, height] of [
    [9, 8],
    [13, 12],
    [16, 9],
    [20, 13],
    [23, 7],
  ]) {
    for (let y = 0; y < height; y += 1) {
      paintPixel(tiles[7], x, 26 - y, y % 3 === 0 ? weedLight : weed);
      if (y > 4) paintPixel(tiles[7], x + (y % 2 === 0 ? 1 : -1), 26 - y, weed);
    }
  }

  return tiles;
}

function makeMacroTileable(input, size, edgeWidth = 12) {
  const output = Buffer.from(input);

  for (let distance = 0; distance < edgeWidth; distance += 1) {
    const blend = 1 - distance / edgeWidth;
    for (let y = 0; y < size; y += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        const left = (y * size + distance) * 4 + channel;
        const right = (y * size + size - 1 - distance) * 4 + channel;
        const average = (output[left] + output[right]) / 2;
        output[left] = Math.round(output[left] * (1 - blend) + average * blend);
        output[right] = Math.round(
          output[right] * (1 - blend) + average * blend,
        );
      }
    }
  }

  for (let distance = 0; distance < edgeWidth; distance += 1) {
    const blend = 1 - distance / edgeWidth;
    for (let x = 0; x < size; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        const top = (distance * size + x) * 4 + channel;
        const bottom = ((size - 1 - distance) * size + x) * 4 + channel;
        const average = (output[top] + output[bottom]) / 2;
        output[top] = Math.round(output[top] * (1 - blend) + average * blend);
        output[bottom] = Math.round(
          output[bottom] * (1 - blend) + average * blend,
        );
      }
    }
  }

  return output;
}

function inheritMacroEdges(input, base, size, edgeWidth = 16) {
  const output = Buffer.from(input);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (distance >= edgeWidth) continue;
      const blend = 1 - distance / edgeWidth;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        output[offset + channel] = Math.round(
          output[offset + channel] * (1 - blend) +
            base[offset + channel] * blend,
        );
      }
    }
  }
  return output;
}

async function terrainMacro(source, topRatio, heightRatio, leftRatio) {
  const top = Math.round(source.height * topRatio);
  const side = Math.min(
    source.width,
    Math.round(source.height * heightRatio),
    source.height - top,
  );
  const availableWidth = source.width - side;
  const left = Math.round(availableWidth * leftRatio);
  const crop = cropRaw(source, left, top, side, side);
  return sharp(crop.data, {
    raw: { width: crop.width, height: crop.height, channels: 4 },
  })
    .resize(TILE_SIZE * 4, TILE_SIZE * 4, { kernel: sharp.kernel.nearest })
    .raw()
    .toBuffer();
}

function splitMacroIntoTiles(macro, size = TILE_SIZE * 4) {
  const tiles = [];
  for (let tileY = 0; tileY < 4; tileY += 1) {
    for (let tileX = 0; tileX < 4; tileX += 1) {
      const tile = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
      for (let y = 0; y < TILE_SIZE; y += 1) {
        const sourceOffset =
          ((tileY * TILE_SIZE + y) * size + tileX * TILE_SIZE) * 4;
        const targetOffset = y * TILE_SIZE * 4;
        macro.copy(
          tile,
          targetOffset,
          sourceOffset,
          sourceOffset + TILE_SIZE * 4,
        );
      }
      tiles.push(tile);
    }
  }
  return tiles;
}

async function buildTerrain() {
  const source = await rawImage(path.join(SOURCE_DIR, "terrain-source-v2.png"));
  const atlasWidth = TILESETS.terrain.columns * TILE_SIZE;
  const atlasHeight = TILESETS.terrain.rows * TILE_SIZE;
  const tiles = Array.from(
    { length: TILESETS.terrain.columns * TILESETS.terrain.rows },
    createTransparentTile,
  );
  const bands = [
    { top: 0.01, height: 0.32 },
    { top: 0.35, height: 0.33 },
    { top: 0.71, height: 0.28 },
  ];

  for (let material = 0; material < bands.length; material += 1) {
    const band = bands[material];
    const first = makeMacroTileable(
      await terrainMacro(source, band.top, band.height, 0.08),
      TILE_SIZE * 4,
    );
    const families = [first];
    for (const leftRatio of [0.34, 0.66, 0.92]) {
      families.push(
        inheritMacroEdges(
          await terrainMacro(source, band.top, band.height, leftRatio),
          first,
          TILE_SIZE * 4,
        ),
      );
    }
    for (let family = 0; family < families.length; family += 1) {
      const atlasRow = material * 4 + family;
      const macroTiles = splitMacroIntoTiles(families[family]);
      for (let tileIndex = 0; tileIndex < macroTiles.length; tileIndex += 1) {
        tiles[atlasRow * TILESETS.terrain.columns + tileIndex] =
          macroTiles[tileIndex];
      }
    }
  }

  const detailTiles = buildTransparentDetailTiles();
  for (let index = 0; index < detailTiles.length; index += 1) {
    tiles[12 * TILESETS.terrain.columns + index] = detailTiles[index];
  }

  const atlas = Buffer.alloc(atlasWidth * atlasHeight * 4);
  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
    const tileX = tileIndex % TILESETS.terrain.columns;
    const tileY = Math.floor(tileIndex / TILESETS.terrain.columns);
    for (let y = 0; y < TILE_SIZE; y += 1) {
      const sourceOffset = y * TILE_SIZE * 4;
      const targetOffset =
        ((tileY * TILE_SIZE + y) * atlasWidth + tileX * TILE_SIZE) * 4;
      tiles[tileIndex].copy(
        atlas,
        targetOffset,
        sourceOffset,
        sourceOffset + TILE_SIZE * 4,
      );
    }
  }
  const output = path.join(IMAGE_DIR, "suburbio-pilot-terrain.png");
  await sharp(atlas, {
    raw: { width: atlasWidth, height: atlasHeight, channels: 4 },
  })
    .png()
    .toFile(output);
  return output;
}

async function transparentPanel(
  sourceName,
  columns,
  rows,
  column,
  row,
  inset = 8,
) {
  const source = await rawImage(path.join(SOURCE_DIR, sourceName));
  const leftBoundary = Math.round((column * source.width) / columns);
  const rightBoundary = Math.round(((column + 1) * source.width) / columns);
  const topBoundary = Math.round((row * source.height) / rows);
  const bottomBoundary = Math.round(((row + 1) * source.height) / rows);
  return clearBorderBackground(
    cropRaw(
      source,
      leftBoundary + inset,
      topBoundary + inset,
      rightBoundary - leftBoundary - inset * 2,
      bottomBoundary - topBoundary - inset * 2,
    ),
  );
}

async function buildProps(houseOneFile) {
  const atlasWidth = 16 * TILE_SIZE;
  const atlasHeight = 10 * TILE_SIZE;
  const composites = [];
  const carSource = await rawImage(path.join(SOURCE_DIR, "car-source.png"));
  composites.push(
    await containInSlot(carSource, 5 * TILE_SIZE, 3 * TILE_SIZE, 4),
  );

  const definitions = [
    { column: 0, row: 0, x: 5, y: 0, width: 2, height: 5 },
    { column: 1, row: 0, x: 7, y: 0, width: 3, height: 2 },
    { column: 2, row: 0, x: 10, y: 0, width: 2, height: 2 },
    { column: 3, row: 0, x: 12, y: 0, width: 4, height: 2 },
    { column: 0, row: 1, x: 0, y: 5, width: 4, height: 2 },
    { column: 1, row: 1, x: 4, y: 5, width: 4, height: 5 },
    { column: 2, row: 1, x: 8, y: 5, width: 3, height: 3 },
    { column: 3, row: 1, x: 11, y: 5, width: 4, height: 2 },
  ];

  for (const definition of definitions) {
    const panel = await transparentPanel(
      "props-source.png",
      4,
      2,
      definition.column,
      definition.row,
      10,
    );
    const slotWidth = definition.width * TILE_SIZE;
    const slotHeight = definition.height * TILE_SIZE;
    const item = await containInSlot(panel, slotWidth, slotHeight, 12);
    composites.push({
      ...item,
      left: definition.x * TILE_SIZE + item.left,
      top: definition.y * TILE_SIZE + item.top,
    });
  }

  const houseOne = await rawImage(houseOneFile);
  const closedDoor = cropRaw(
    houseOne,
    6 * TILE_SIZE,
    8 * TILE_SIZE,
    TILE_SIZE,
    TILE_SIZE,
  );
  const closedDoorPng = await sharp(closedDoor.data, {
    raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 },
  })
    .png()
    .toBuffer();
  composites.push({
    input: closedDoorPng,
    left: 14 * TILE_SIZE,
    top: 9 * TILE_SIZE,
  });

  const output = path.join(IMAGE_DIR, "suburbio-pilot-props.png");
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
    .toFile(output);
  return output;
}

async function buildEnvironment() {
  const atlasWidth = 18 * TILE_SIZE;
  const atlasHeight = 13 * TILE_SIZE;
  const composites = [];
  const definitions = [
    { column: 0, row: 0, x: 0, y: 0, width: 5, height: 6, clearNeutral: true },
    { column: 1, row: 0, x: 5, y: 0, width: 5, height: 3 },
    {
      column: 2,
      row: 0,
      x: 10,
      y: 0,
      width: 4,
      height: 3,
      source: "environment-source-v2.png",
    },
    {
      column: 3,
      row: 0,
      x: 14,
      y: 0,
      width: 4,
      height: 3,
      source: "environment-source-v2.png",
    },
    { column: 0, row: 1, x: 0, y: 6, width: 4, height: 4 },
    { column: 1, row: 1, x: 4, y: 6, width: 4, height: 4 },
    { column: 2, row: 1, x: 8, y: 6, width: 5, height: 3 },
    { column: 3, row: 1, x: 13, y: 6, width: 4, height: 3 },
    { column: 0, row: 2, x: 0, y: 10, width: 4, height: 3 },
    { column: 1, row: 2, x: 4, y: 10, width: 3, height: 3 },
    { column: 2, row: 2, x: 7, y: 10, width: 4, height: 2 },
    { column: 3, row: 2, x: 11, y: 10, width: 4, height: 3 },
  ];

  for (const definition of definitions) {
    let panel = await transparentPanel(
      definition.source ?? "environment-source-v3.png",
      4,
      3,
      definition.column,
      definition.row,
      8,
    );
    if (definition.clearNeutral) panel = clearBrightNeutralPixels(panel);
    const slotWidth = definition.width * TILE_SIZE;
    const slotHeight = definition.height * TILE_SIZE;
    const item = await containInSlot(panel, slotWidth, slotHeight, 2);
    composites.push({
      ...item,
      left: definition.x * TILE_SIZE + item.left,
      top: definition.y * TILE_SIZE + item.top,
    });
  }

  const output = path.join(IMAGE_DIR, "suburbio-pilot-environment.png");
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
    .toFile(output);
  return output;
}

async function buildHouse(
  sourceName,
  outputName,
  columnsPerPanel,
  rowsPerPanel,
) {
  const slotWidth = columnsPerPanel * TILE_SIZE;
  const slotHeight = rowsPerPanel * TILE_SIZE;
  const composites = [];
  const panels = [];
  for (let panelIndex = 0; panelIndex < 2; panelIndex += 1) {
    const panel = await transparentPanel(sourceName, 2, 1, panelIndex, 0, 12);
    const item = await containInSlot(panel, slotWidth, slotHeight, 3);
    panels.push(item);
    composites.push({
      ...item,
      left: panelIndex * slotWidth + item.left,
      top: item.top,
    });
  }

  const base = await rawImage(panels[0].input);
  for (let offset = 0; offset < base.data.length; offset += 4) {
    base.data[offset] = 11;
    base.data[offset + 1] = 13;
    base.data[offset + 2] = 12;
    base.data[offset + 3] = Math.round(base.data[offset + 3] * 0.34);
  }
  const shadow = await sharp(base.data, {
    raw: { width: base.width, height: base.height, channels: 4 },
  })
    .blur(8)
    .png()
    .toBuffer();
  composites.push({
    input: shadow,
    left: slotWidth * 2 + panels[0].left + 12,
    top: Math.max(0, panels[0].top - 20),
  });

  const output = path.join(IMAGE_DIR, outputName);
  await sharp({
    create: {
      width: slotWidth * 3,
      height: slotHeight,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(composites)
    .png()
    .toFile(output);
  return output;
}

function buildMapLayers() {
  const ground = emptyLayer();
  const details = emptyLayer();
  const below = emptyLayer();
  const collision = emptyLayer();
  const walls = emptyLayer();
  const doors = emptyLayer();
  const above = emptyLayer();
  const roofs = emptyLayer();

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      let material = 0;
      if (y >= 16 && y <= 23) material = 1;
      if ((y >= 14 && y <= 15) || (y >= 24 && y <= 25)) material = 2;
      if (x >= 20 && x <= 25 && y <= 15) material = 1;
      if ((x >= 18 && x <= 19 && y <= 15) || (x >= 26 && x <= 27 && y <= 15))
        material = 2;
      if (x >= 7 && x <= 9 && y >= 10 && y <= 15) material = 2;
      if (x >= 37 && x <= 41 && y >= 11 && y <= 15) material = 2;
      if (x >= 22 && x <= 24 && y >= 24) material = 2;

      const family = (Math.floor(x / 4) * 7 + Math.floor(y / 4) * 11) % 4;
      const macroTile = (y % 4) * 4 + (x % 4);
      setTile(
        ground,
        x,
        y,
        tileGid(TILESETS.terrain, macroTile, material * 4 + family),
      );
    }
  }

  for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
    const northOpening =
      (x >= 7 && x <= 9) || (x >= 20 && x <= 25) || (x >= 37 && x <= 41);
    if (!northOpening)
      setTile(details, x, 15, tileGid(TILESETS.terrain, 0, 12));
    if (x < 22 || x > 24)
      setTile(details, x, 24, tileGid(TILESETS.terrain, 1, 12));
  }
  for (let y = 1; y < 14; y += 1) {
    setTile(details, 19, y, tileGid(TILESETS.terrain, 2, 12));
    setTile(details, 26, y, tileGid(TILESETS.terrain, 3, 12));
  }
  for (let x = 3; x < 47; x += 7) {
    setTile(details, x, 19, tileGid(TILESETS.terrain, 4, 12));
  }
  setTile(details, 13, 16, tileGid(TILESETS.terrain, 5, 12));
  setTile(details, 38, 21, tileGid(TILESETS.terrain, 6, 12));
  setTile(details, 17, 26, tileGid(TILESETS.terrain, 7, 12));
  setTile(details, 42, 13, tileGid(TILESETS.terrain, 7, 12));

  for (const fenceX of [0, 5, 10, 14, 28, 33, 38, 43]) {
    stampTiles(below, fenceX, 1, TILESETS.environment, 5, 0, 5, 3);
  }
  stampTiles(below, 7, 11, TILESETS.environment, 11, 10, 4, 3);
  stampTiles(below, 6, 16, TILESETS.environment, 7, 10, 4, 2);
  stampTiles(below, 18, 21, TILESETS.environment, 7, 10, 4, 2);
  stampTiles(below, 28, 17, TILESETS.environment, 7, 10, 4, 2);
  stampTiles(below, 40, 19, TILESETS.environment, 4, 10, 3, 3);

  stampTiles(below, 2, 3, TILESETS.houseOne, 24, 0, 12, 10);
  stampTiles(below, 31, 3, TILESETS.houseTwo, 28, 0, 14, 12);
  stampTiles(walls, 2, 2, TILESETS.houseOne, 0, 0, 12, 10);
  setTile(walls, 8, 10, 0);
  stampTiles(roofs, 2, 0, TILESETS.houseOne, 12, 0, 12, 10);
  stampTiles(walls, 31, 2, TILESETS.houseTwo, 0, 0, 14, 12);
  stampTiles(roofs, 31, 0, TILESETS.houseTwo, 14, 0, 14, 12);

  stampTiles(below, 31, 17, TILESETS.props, 0, 0, 5, 3);
  stampTiles(above, 2, 19, TILESETS.props, 5, 0, 2, 5);
  stampTiles(above, 3, 24, TILESETS.props, 7, 0, 3, 2);
  stampTiles(above, 13, 10, TILESETS.props, 10, 0, 2, 2);
  stampTiles(above, 0, 11, TILESETS.environment, 10, 0, 4, 3);
  stampTiles(above, 3, 12, TILESETS.props, 12, 0, 4, 2);
  stampTiles(above, 14, 3, TILESETS.environment, 0, 0, 5, 6);
  stampTiles(above, 0, 8, TILESETS.environment, 0, 6, 4, 4);
  stampTiles(above, 1, 10, TILESETS.environment, 8, 6, 5, 3);
  stampTiles(below, 10, 10, TILESETS.environment, 8, 6, 5, 3);
  stampTiles(above, 28, 11, TILESETS.environment, 8, 6, 5, 3);
  stampTiles(above, 42, 11, TILESETS.environment, 8, 6, 5, 3);
  // Vegetacao baixa deve ficar sob o personagem; na camada superior ela
  // encobria inclusive a cabeca ao atravessar o quintal da casa esquerda.
  stampTiles(below, 14, 11, TILESETS.environment, 13, 6, 4, 3);
  stampTiles(above, 43, 10, TILESETS.environment, 13, 6, 4, 3);
  stampTiles(above, 44, 11, TILESETS.environment, 14, 0, 4, 3);
  stampTiles(above, -1, 3, TILESETS.environment, 0, 0, 5, 6);
  stampTiles(above, 0, 26, TILESETS.environment, 8, 6, 5, 3);
  stampTiles(above, 8, 27, TILESETS.environment, 13, 6, 4, 3);
  stampTiles(above, 14, 27, TILESETS.environment, 0, 10, 4, 3);
  stampTiles(above, 27, 27, TILESETS.environment, 8, 6, 5, 3);
  stampTiles(above, 34, 25, TILESETS.environment, 0, 0, 5, 6);
  stampTiles(above, 39, 27, TILESETS.environment, 0, 10, 4, 3);
  stampTiles(above, 43, 27, TILESETS.environment, 4, 6, 4, 4);
  setTile(doors, 8, 10, tileGid(TILESETS.props, 14, 9));

  blockRect(collision, 0, 0, MAP_WIDTH, 1);
  blockRect(collision, 0, MAP_HEIGHT - 1, MAP_WIDTH, 1);
  blockRect(collision, 0, 0, 1, MAP_HEIGHT);
  blockRect(collision, MAP_WIDTH - 1, 0, 1, MAP_HEIGHT);
  blockRect(collision, 2, 2, 12, 9);
  blockRect(collision, 8, 10, 1, 1);
  blockRect(collision, 2, 11, 4, 1);
  blockRect(collision, 10, 11, 4, 1);
  unblock(collision, 8, 11);
  blockRect(collision, 31, 2, 14, 12);
  blockRect(collision, 31, 18, 5, 2);
  blockRect(collision, 0, 13, 7, 1);
  blockRect(collision, 15, 8, 3, 1);
  blockRect(collision, 0, 11, 4, 1);
  blockRect(collision, 3, 23, 1, 1);
  blockRect(collision, 35, 30, 3, 1);
  blockRect(collision, 39, 29, 4, 1);
  blockRect(collision, 43, 30, 4, 1);
  blockRect(collision, 44, 13, 4, 1);
  blockRect(collision, 1, 8, 2, 1);
  blockRect(collision, 0, 28, 5, 1);
  blockRect(collision, 14, 29, 4, 1);
  blockRect(collision, 27, 29, 5, 1);

  return { ground, details, below, collision, walls, doors, above, roofs };
}

function tiledTileLayer(id, name, data, options = {}) {
  return {
    data,
    height: MAP_HEIGHT,
    id,
    name,
    opacity: options.opacity ?? 1,
    type: "tilelayer",
    visible: options.visible ?? true,
    width: MAP_WIDTH,
    x: 0,
    y: 0,
  };
}

function tileCenter(tileX, tileY) {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

function objectPoint(id, name, type, tileX, tileY, properties = []) {
  return {
    ...tileCenter(tileX, tileY),
    height: 0,
    id,
    name,
    point: true,
    properties,
    rotation: 0,
    type,
    visible: true,
    width: 0,
  };
}

function embeddedTileset(tileset, name, image, tiles = []) {
  const definition = {
    columns: tileset.columns,
    firstgid: tileset.firstgid,
    image: `../../images/auto-combat/pilot/${image}`,
    imageheight: tileset.rows * TILE_SIZE,
    imagewidth: tileset.columns * TILE_SIZE,
    margin: 0,
    name,
    spacing: 0,
    tilecount: tileset.columns * tileset.rows,
    tileheight: TILE_SIZE,
    tilewidth: TILE_SIZE,
    type: "tileset",
    version: "1.10",
  };
  if (tiles.length) definition.tiles = tiles;
  return definition;
}

function buildTmj(layers) {
  const navigationObjects = [
    objectPoint(1, "spawn-sul", "spawn", 23, 25, [
      { name: "destination", type: "bool", value: true },
    ]),
    objectPoint(2, "rota-oeste", "destination", 7, 20, [
      { name: "destination", type: "bool", value: true },
    ]),
    objectPoint(3, "rota-leste", "destination", 42, 19, [
      { name: "destination", type: "bool", value: true },
    ]),
    objectPoint(4, "rotatoria-central", "destination", 23, 17, [
      { name: "destination", type: "bool", value: true },
    ]),
    objectPoint(5, "casa-abandonada-porta", "portal", 8, 11, [
      { name: "destination", type: "bool", value: false },
    ]),
    objectPoint(6, "beco-sudeste", "destination", 30, 27, [
      { name: "destination", type: "bool", value: true },
    ]),
  ];
  const portalObjects = [
    objectPoint(7, "entrada-casa-abandonada", "portal", 8, 11, [
      { name: "nodeId", type: "string", value: "casa-abandonada-porta" },
      { name: "toAreaId", type: "string", value: "casa-abandonada" },
      { name: "toNodeId", type: "string", value: "entrada" },
      { name: "doorColumn", type: "int", value: 8 },
      { name: "doorRow", type: "int", value: 10 },
    ]),
  ];

  return {
    compressionlevel: -1,
    height: MAP_HEIGHT,
    infinite: false,
    layers: [
      tiledTileLayer(1, "ground", layers.ground),
      tiledTileLayer(2, "ground-details", layers.details),
      tiledTileLayer(3, "objects-below", layers.below),
      tiledTileLayer(4, "collision", layers.collision, { visible: false }),
      tiledTileLayer(5, "walls-fences", layers.walls),
      tiledTileLayer(6, "doors", layers.doors),
      tiledTileLayer(7, "objects-above", layers.above),
      tiledTileLayer(8, "roofs-occlusion", layers.roofs),
      {
        draworder: "topdown",
        id: 9,
        name: "entrances-exits",
        objects: portalObjects,
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
        objects: navigationObjects,
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 11,
    nextobjectid: 8,
    orientation: "orthogonal",
    properties: [
      { name: "agentHalfHeight", type: "float", value: 6 },
      { name: "agentHalfWidth", type: "float", value: 9 },
      { name: "areaId", type: "string", value: "suburbio" },
      {
        name: "label",
        type: "string",
        value: "Suburbio Silencioso - Distrito aberto",
      },
      { name: "portalNodeId", type: "string", value: "casa-abandonada-porta" },
      { name: "randomRouteMinDistance", type: "float", value: 256 },
      { name: "spawnNodeId", type: "string", value: "spawn-sul" },
    ],
    renderorder: "right-down",
    tiledversion: "1.11.2",
    tileheight: TILE_SIZE,
    tilesets: [
      embeddedTileset(
        TILESETS.terrain,
        "suburbio-pilot-terrain",
        "suburbio-pilot-terrain.png",
      ),
      embeddedTileset(
        TILESETS.props,
        "suburbio-pilot-props",
        "suburbio-pilot-props.png",
        [
          {
            id: 158,
            properties: [
              { name: "door", type: "bool", value: true },
              { name: "collides", type: "bool", value: true },
            ],
          },
          {
            id: 159,
            properties: [
              { name: "door", type: "bool", value: true },
              { name: "collides", type: "bool", value: false },
            ],
          },
        ],
      ),
      embeddedTileset(
        TILESETS.environment,
        "suburbio-pilot-environment",
        "suburbio-pilot-environment.png",
      ),
      embeddedTileset(
        TILESETS.houseOne,
        "suburbio-pilot-house-one",
        "suburbio-pilot-house-one.png",
      ),
      embeddedTileset(
        TILESETS.houseTwo,
        "suburbio-pilot-house-two",
        "suburbio-pilot-house-two.png",
      ),
    ],
    tilewidth: TILE_SIZE,
    type: "map",
    version: "1.10",
    width: MAP_WIDTH,
  };
}

function tsx({ name, image, columns, rows, tiles = "" }) {
  const width = columns * TILE_SIZE;
  const height = rows * TILE_SIZE;
  return `<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" name="${name}" tilewidth="${TILE_SIZE}" tileheight="${TILE_SIZE}" tilecount="${columns * rows}" columns="${columns}">
 <image source="../../images/auto-combat/pilot/${image}" width="${width}" height="${height}"/>
${tiles}
</tileset>
`;
}

function neighbours(tile) {
  return [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 },
  ].filter(({ x, y }) => x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT);
}

function reachableTiles(collision, start) {
  const reached = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of neighbours(queue[head])) {
      const key = `${next.x},${next.y}`;
      if (collision[indexAt(next.x, next.y)] !== 0 || reached.has(key))
        continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return queue;
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
      if (collision[indexAt(next.x, next.y)] !== 0 || previous.has(key))
        continue;
      previous.set(key, currentKey);
      queue.push(next);
    }
  }
  if (!previous.has(goalKey)) return null;
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
  const layerNames = new Set(tmj.layers.map((layer) => layer.name));
  for (const required of REQUIRED_LAYERS) {
    if (!layerNames.has(required))
      throw new Error(`Camada obrigatoria ausente: ${required}`);
  }
  const navigation = tmj.layers.find(
    (layer) => layer.name === "navigation-points",
  ).objects;
  const portalObjects = tmj.layers.find(
    (layer) => layer.name === "entrances-exits",
  ).objects;
  const points = [...navigation, ...portalObjects].map((object) => ({
    name: object.name,
    x: Math.floor(object.x / TILE_SIZE),
    y: Math.floor(object.y / TILE_SIZE),
  }));
  for (const point of points) {
    if (collision[indexAt(point.x, point.y)] !== 0) {
      throw new Error(
        `Ponto ${point.name} esta sobre colisao em ${point.x},${point.y}.`,
      );
    }
  }
  const spawn = points.find((point) => point.name === "spawn-sul");
  const reachable = reachableTiles(collision, spawn);
  const reachableSet = new Set(reachable.map((tile) => `${tile.x},${tile.y}`));
  for (const point of points) {
    if (!reachableSet.has(`${point.x},${point.y}`)) {
      throw new Error(
        `Ponto ${point.name} nao e alcancavel a partir do spawn.`,
      );
    }
  }

  let seed = 0xdead1d1e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    const start = reachable[Math.floor(random() * reachable.length)];
    const goal = reachable[Math.floor(random() * reachable.length)];
    const route = findRoute(collision, start, goal);
    if (!route) throw new Error(`Rota ${attempt} nao encontrada.`);
    for (let step = 0; step < route.length; step += 1) {
      const tile = route[step];
      if (collision[indexAt(tile.x, tile.y)] !== 0) {
        throw new Error(
          `Rota ${attempt} atravessou colisao em ${tile.x},${tile.y}.`,
        );
      }
      if (step > 0) {
        const previous = route[step - 1];
        if (
          Math.abs(tile.x - previous.x) + Math.abs(tile.y - previous.y) !==
          1
        ) {
          throw new Error(`Rota ${attempt} contem passo diagonal ou invalido.`);
        }
      }
    }
  }
  return { reachable: reachable.length, simulatedRoutes: 3000 };
}

async function loadAtlas(file, definition) {
  const image = await rawImage(file);
  return { ...image, ...definition };
}

function blitTile(canvas, atlas, gid, mapX, mapY) {
  const localId = gid - atlas.firstgid;
  if (localId < 0 || localId >= atlas.columns * atlas.rows) return false;
  const sourceX = (localId % atlas.columns) * TILE_SIZE;
  const sourceY = Math.floor(localId / atlas.columns) * TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const sourceOffset = ((sourceY + y) * atlas.width + sourceX + x) * 4;
      const alpha = atlas.data[sourceOffset + 3] / 255;
      if (alpha === 0) continue;
      const targetOffset =
        ((mapY * TILE_SIZE + y) * MAP_PIXELS.width + mapX * TILE_SIZE + x) * 4;
      const inverse = 1 - alpha;
      canvas[targetOffset] = Math.round(
        atlas.data[sourceOffset] * alpha + canvas[targetOffset] * inverse,
      );
      canvas[targetOffset + 1] = Math.round(
        atlas.data[sourceOffset + 1] * alpha +
          canvas[targetOffset + 1] * inverse,
      );
      canvas[targetOffset + 2] = Math.round(
        atlas.data[sourceOffset + 2] * alpha +
          canvas[targetOffset + 2] * inverse,
      );
      canvas[targetOffset + 3] = 255;
    }
  }
  return true;
}

function renderTileLayer(canvas, layer, atlases) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const gid = layer[indexAt(x, y)];
      if (!gid) continue;
      for (const atlas of atlases) {
        if (blitTile(canvas, atlas, gid, x, y)) break;
      }
    }
  }
}

async function overlayLeon(canvas, tileX, tileY) {
  const file = path.join(IMAGE_DIR, "..", "characters/leon-v1/leon-walk.png");
  try {
    const frame = await sharp(file)
      .extract({ left: 0, top: 0, width: 112, height: 96 })
      .trim({ background: "#00000000" })
      .resize({
        width: 72,
        height: 96,
        fit: "inside",
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
    const metadata = await sharp(frame).metadata();
    const actor = await rawImage(frame);
    const left = Math.round(
      tileX * TILE_SIZE + TILE_SIZE / 2 - metadata.width / 2,
    );
    const top = Math.round((tileY + 1) * TILE_SIZE - metadata.height);
    for (let y = 0; y < actor.height; y += 1) {
      for (let x = 0; x < actor.width; x += 1) {
        const targetX = left + x;
        const targetY = top + y;
        if (
          targetX < 0 ||
          targetY < 0 ||
          targetX >= MAP_PIXELS.width ||
          targetY >= MAP_PIXELS.height
        )
          continue;
        const sourceOffset = (y * actor.width + x) * 4;
        const alpha = actor.data[sourceOffset + 3] / 255;
        if (alpha === 0) continue;
        const targetOffset = (targetY * MAP_PIXELS.width + targetX) * 4;
        const inverse = 1 - alpha;
        canvas[targetOffset] = Math.round(
          actor.data[sourceOffset] * alpha + canvas[targetOffset] * inverse,
        );
        canvas[targetOffset + 1] = Math.round(
          actor.data[sourceOffset + 1] * alpha +
            canvas[targetOffset + 1] * inverse,
        );
        canvas[targetOffset + 2] = Math.round(
          actor.data[sourceOffset + 2] * alpha +
            canvas[targetOffset + 2] * inverse,
        );
        canvas[targetOffset + 3] = 255;
      }
    }
  } catch (error) {
    console.warn(`Preview sem Leon: ${error.message}`);
  }
}

async function buildPreview(layers, files) {
  const atlases = await Promise.all([
    loadAtlas(files.terrain, TILESETS.terrain),
    loadAtlas(files.props, TILESETS.props),
    loadAtlas(files.environment, TILESETS.environment),
    loadAtlas(files.houseOne, TILESETS.houseOne),
    loadAtlas(files.houseTwo, TILESETS.houseTwo),
  ]);
  const canvas = Buffer.alloc(MAP_PIXELS.width * MAP_PIXELS.height * 4);
  renderTileLayer(canvas, layers.ground, atlases);
  renderTileLayer(canvas, layers.details, atlases);
  renderTileLayer(canvas, layers.below, atlases);
  renderTileLayer(canvas, layers.walls, atlases);
  await overlayLeon(canvas, 23, 20);
  renderTileLayer(canvas, layers.above, atlases);
  renderTileLayer(canvas, layers.roofs, atlases);
  const output = path.join(IMAGE_DIR, "suburbio-pilot-preview.png");
  await sharp(canvas, {
    raw: { width: MAP_PIXELS.width, height: MAP_PIXELS.height, channels: 4 },
  })
    .png()
    .toFile(output);
  return output;
}

async function buildCollisionDebug(previewFile, collision, tmj) {
  const base = await rawImage(previewFile);
  const canvas = Buffer.from(base.data);
  const paintTile = (tileX, tileY, color, alpha) => {
    for (let y = tileY * TILE_SIZE; y < (tileY + 1) * TILE_SIZE; y += 1) {
      for (let x = tileX * TILE_SIZE; x < (tileX + 1) * TILE_SIZE; x += 1) {
        const offset = (y * MAP_PIXELS.width + x) * 4;
        canvas[offset] = Math.round(
          color[0] * alpha + canvas[offset] * (1 - alpha),
        );
        canvas[offset + 1] = Math.round(
          color[1] * alpha + canvas[offset + 1] * (1 - alpha),
        );
        canvas[offset + 2] = Math.round(
          color[2] * alpha + canvas[offset + 2] * (1 - alpha),
        );
        canvas[offset + 3] = 255;
      }
    }
  };

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (collision[indexAt(x, y)] !== 0) paintTile(x, y, [225, 40, 40], 0.42);
    }
  }

  const navigation = tmj.layers.find(
    (layer) => layer.name === "navigation-points",
  ).objects;
  for (const point of navigation) {
    paintTile(
      Math.floor(point.x / TILE_SIZE),
      Math.floor(point.y / TILE_SIZE),
      point.type === "spawn" ? [40, 220, 95] : [45, 145, 255],
      0.62,
    );
  }

  const output = path.join(IMAGE_DIR, "suburbio-pilot-collision-debug.png");
  await sharp(canvas, {
    raw: { width: MAP_PIXELS.width, height: MAP_PIXELS.height, channels: 4 },
  })
    .png()
    .toFile(output);
  return output;
}

async function main() {
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  await fs.mkdir(MAP_DIR, { recursive: true });

  const files = {
    terrain: await buildTerrain(),
    environment: await buildEnvironment(),
    houseOne: await buildHouse(
      "house-one-source.png",
      "suburbio-pilot-house-one.png",
      12,
      10,
    ),
    houseTwo: await buildHouse(
      "house-two-source.png",
      "suburbio-pilot-house-two.png",
      14,
      12,
    ),
  };
  files.props = await buildProps(files.houseOne);

  const layers = buildMapLayers();
  const tmj = buildTmj(layers);
  const validation = validateMap(tmj, layers.collision);

  await Promise.all([
    fs.writeFile(
      path.join(MAP_DIR, "suburbio-pilot-terrain.tsx"),
      tsx({
        name: "suburbio-pilot-terrain",
        image: path.basename(files.terrain),
        columns: TILESETS.terrain.columns,
        rows: TILESETS.terrain.rows,
      }),
    ),
    fs.writeFile(
      path.join(MAP_DIR, "suburbio-pilot-props.tsx"),
      tsx({
        name: "suburbio-pilot-props",
        image: path.basename(files.props),
        columns: 16,
        rows: 10,
        tiles: ` <tile id="158">
  <properties>
   <property name="door" type="bool" value="true"/>
   <property name="collides" type="bool" value="true"/>
  </properties>
 </tile>
 <tile id="159">
  <properties>
   <property name="door" type="bool" value="true"/>
   <property name="collides" type="bool" value="false"/>
  </properties>
 </tile>`,
      }),
    ),
    fs.writeFile(
      path.join(MAP_DIR, "suburbio-pilot-environment.tsx"),
      tsx({
        name: "suburbio-pilot-environment",
        image: path.basename(files.environment),
        columns: 18,
        rows: 13,
      }),
    ),
    fs.writeFile(
      path.join(MAP_DIR, "suburbio-pilot-house-one.tsx"),
      tsx({
        name: "suburbio-pilot-house-one",
        image: path.basename(files.houseOne),
        columns: 36,
        rows: 10,
      }),
    ),
    fs.writeFile(
      path.join(MAP_DIR, "suburbio-pilot-house-two.tsx"),
      tsx({
        name: "suburbio-pilot-house-two",
        image: path.basename(files.houseTwo),
        columns: 42,
        rows: 12,
      }),
    ),
    fs.writeFile(
      path.join(MAP_DIR, "suburbio-silencioso-pilot.tmj"),
      `${JSON.stringify(tmj, null, 2)}\n`,
    ),
  ]);

  files.preview = await buildPreview(layers, files);
  files.collisionDebug = await buildCollisionDebug(
    files.preview,
    layers.collision,
    tmj,
  );
  console.log(
    JSON.stringify(
      {
        map: `${MAP_WIDTH}x${MAP_HEIGHT}`,
        tileSize: TILE_SIZE,
        layers: REQUIRED_LAYERS,
        validation,
        outputs: files,
      },
      null,
      2,
    ),
  );
}

await main();
