import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, "..");
const SPRITE_DIR = path.join(
  FRONTEND_DIR,
  "src/assets/images/auto-combat/characters/leon-v1",
);
const SOURCE_DIR = path.join(SPRITE_DIR, "source");
const FRAME_WIDTH = 112;
const FRAME_HEIGHT = 96;
const SHEETS = ["walk", "investigate", "attack", "hurt", "death"];

function buildExteriorTransparencyMask(data, width, height) {
  const mask = new Uint8Array(width * height);

  for (let frameTop = 0; frameTop < height; frameTop += FRAME_HEIGHT) {
    for (let frameLeft = 0; frameLeft < width; frameLeft += FRAME_WIDTH) {
      const queue = [];
      const enqueue = (x, y) => {
        const index = y * width + x;
        if (mask[index] || data[index * 4 + 3] !== 0) return;
        mask[index] = 1;
        queue.push({ x, y });
      };

      for (let x = frameLeft; x < frameLeft + FRAME_WIDTH; x += 1) {
        enqueue(x, frameTop);
        enqueue(x, frameTop + FRAME_HEIGHT - 1);
      }
      for (let y = frameTop; y < frameTop + FRAME_HEIGHT; y += 1) {
        enqueue(frameLeft, y);
        enqueue(frameLeft + FRAME_WIDTH - 1, y);
      }

      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head];
        for (const [offsetX, offsetY] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = current.x + offsetX;
          const y = current.y + offsetY;
          if (
            x >= frameLeft &&
            x < frameLeft + FRAME_WIDTH &&
            y >= frameTop &&
            y < frameTop + FRAME_HEIGHT
          ) {
            enqueue(x, y);
          }
        }
      }
    }
  }

  return mask;
}

function touchesExteriorTransparency(
  exteriorTransparency,
  width,
  frameLeft,
  frameTop,
  x,
  y,
) {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (
        neighborX < frameLeft ||
        neighborX >= frameLeft + FRAME_WIDTH ||
        neighborY < frameTop ||
        neighborY >= frameTop + FRAME_HEIGHT
      ) {
        return true;
      }
      if (exteriorTransparency[neighborY * width + neighborX]) return true;
    }
  }
  return false;
}

function removeNeutralMatte(data, width, height) {
  const output = Buffer.from(data);
  const exteriorTransparency = buildExteriorTransparencyMask(
    data,
    width,
    height,
  );
  let removedPixels = 0;

  for (let frameTop = 0; frameTop < height; frameTop += FRAME_HEIGHT) {
    for (let frameLeft = 0; frameLeft < width; frameLeft += FRAME_WIDTH) {
      for (let y = frameTop; y < frameTop + FRAME_HEIGHT; y += 1) {
        for (let x = frameLeft; x < frameLeft + FRAME_WIDTH; x += 1) {
          const offset = (y * width + x) * 4;
          if (data[offset + 3] === 0) continue;
          if (
            !touchesExteriorTransparency(
              exteriorTransparency,
              width,
              frameLeft,
              frameTop,
              x,
              y,
            )
          ) {
            continue;
          }

          const red = data[offset];
          const green = data[offset + 1];
          const blue = data[offset + 2];
          const maximum = Math.max(red, green, blue);
          const minimum = Math.min(red, green, blue);
          const brightness = (red + green + blue) / 3;

          // The original cutout left an opaque gray matte around the silhouette.
          // Brown hair, skin and clothing accents remain outside this neutral range.
          if (maximum - minimum <= 40 && brightness >= 55) {
            output[offset + 3] = 0;
            removedPixels += 1;
          }
        }
      }
    }
  }

  return { output, removedPixels };
}

async function cleanSheet(name) {
  const source = path.join(SOURCE_DIR, `leon-${name}.png`);
  const destination = path.join(SPRITE_DIR, `leon-${name}.png`);
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (
    info.width % FRAME_WIDTH !== 0 ||
    info.height % FRAME_HEIGHT !== 0
  ) {
    throw new Error(
      `${path.basename(source)} nao respeita quadros de ${FRAME_WIDTH}x${FRAME_HEIGHT}.`,
    );
  }

  const { output, removedPixels } = removeNeutralMatte(
    data,
    info.width,
    info.height,
  );
  await sharp(output, { raw: info }).png().toFile(destination);
  return { name, removedPixels };
}

const results = await Promise.all(SHEETS.map(cleanSheet));
for (const result of results) {
  console.log(
    `Leon ${result.name}: ${result.removedPixels} pixels de matte removidos.`,
  );
}
