import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [inputPath, outputPath] = process.argv.slice(2);
const COLUMNS = 8;
const ROWS = 4;
const FRAME_WIDTH = 112;
const FRAME_HEIGHT = 96;

if (!inputPath || !outputPath) {
  throw new Error(
    "Uso: node scripts/prepare-generated-character-sprite-8.mjs <entrada.png> <saida.png>",
  );
}

const { data, info } = await sharp(path.resolve(inputPath))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const frames = [];

function clearSmallComponents(left, top, right, bottom) {
  const width = right - left;
  const height = bottom - top;
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let localY = 0; localY < height; localY += 1) {
    for (let localX = 0; localX < width; localX += 1) {
      const start = localY * width + localX;
      if (visited[start]) continue;
      visited[start] = 1;
      if (data[((top + localY) * info.width + left + localX) * 4 + 3] < 16) continue;
      const pixels = [start];
      for (let head = 0; head < pixels.length; head += 1) {
        const current = pixels[head];
        const x = current % width;
        const y = Math.floor(current / width);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nextX = x + dx;
            const nextY = y + dy;
            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
            const next = nextY * width + nextX;
            if (visited[next]) continue;
            visited[next] = 1;
            if (data[((top + nextY) * info.width + left + nextX) * 4 + 3] >= 16) {
              pixels.push(next);
            }
          }
        }
      }
      components.push(pixels);
    }
  }

  const largest = Math.max(0, ...components.map((component) => component.length));
  for (const component of components) {
    if (component.length >= Math.max(40, largest * 0.12)) continue;
    for (const pixel of component) {
      const x = left + (pixel % width);
      const y = top + Math.floor(pixel / width);
      data[(y * info.width + x) * 4 + 3] = 0;
    }
  }
}

for (let row = 0; row < ROWS; row += 1) {
  const cellTop = Math.round((row * info.height) / ROWS);
  const cellBottom = Math.round(((row + 1) * info.height) / ROWS);
  const pitch = info.width / COLUMNS;
  const seams = [0];
  for (let boundary = 1; boundary < COLUMNS; boundary += 1) {
    const expected = Math.round(boundary * pitch);
    const searchRadius = Math.round(pitch * 0.22);
    let best = expected;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let x = expected - searchRadius; x <= expected + searchRadius; x += 1) {
      if (x <= seams[boundary - 1] || x >= info.width) continue;
      let occupied = 0;
      for (let y = cellTop; y < cellBottom; y += 1) {
        if (data[(y * info.width + x) * 4 + 3] >= 16) occupied += 1;
      }
      const score = occupied * pitch + Math.abs(x - expected);
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    seams.push(best);
  }
  seams.push(info.width);
  for (let column = 0; column < COLUMNS; column += 1) {
    const cellLeft = seams[column];
    const cellRight = seams[column + 1];
    clearSmallComponents(cellLeft, cellTop, cellRight, cellBottom);
    let left = cellRight;
    let top = cellBottom;
    let right = cellLeft;
    let bottom = cellTop;

    for (let y = cellTop; y < cellBottom; y += 1) {
      for (let x = cellLeft; x < cellRight; x += 1) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha < 16) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }

    if (right < left || bottom < top) {
      throw new Error(`Quadro vazio na linha ${row + 1}, coluna ${column + 1}.`);
    }
    frames.push({ left, top, width: right - left + 1, height: bottom - top + 1 });
  }
}

const scale = Math.min(
  (FRAME_WIDTH - 8) / Math.max(...frames.map((frame) => frame.width)),
  (FRAME_HEIGHT - 6) / Math.max(...frames.map((frame) => frame.height)),
);
const overlays = await Promise.all(
  frames.map(async (frame, index) => {
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const image = await sharp(data, { raw: info })
      .extract(frame)
      .resize(width, height, { kernel: "lanczos3" })
      .png()
      .toBuffer();
    return {
      input: image,
      left: (index % COLUMNS) * FRAME_WIDTH + Math.round((FRAME_WIDTH - width) / 2),
      top: Math.floor(index / COLUMNS) * FRAME_HEIGHT + FRAME_HEIGHT - 3 - height,
    };
  }),
);

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await sharp({
  create: {
    width: COLUMNS * FRAME_WIDTH,
    height: ROWS * FRAME_HEIGHT,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(overlays)
  .png()
  .toFile(path.resolve(outputPath));

console.log(`Folha pronta: ${path.resolve(outputPath)} (${COLUMNS * FRAME_WIDTH}x${ROWS * FRAME_HEIGHT})`);
