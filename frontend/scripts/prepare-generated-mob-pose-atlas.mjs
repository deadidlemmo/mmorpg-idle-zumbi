import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [sourcePath, outputPath] = process.argv.slice(2);
const adaptiveColumns = process.argv.includes("--adaptive-columns");
const columns = 4;
const rows = 4;
const frameWidth = 112;
const frameHeight = 96;

if (!sourcePath || !outputPath) {
  throw new Error(
    "Uso: node scripts/prepare-generated-mob-pose-atlas.mjs <atlas.png> <poses.png>",
  );
}

const { data, info } = await sharp(path.resolve(sourcePath))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const sourceWidth = info.width;
const sourceHeight = info.height;
const sourceChannels = info.channels;
const poses = [];

function getColumnBoundaries(row) {
  if (!adaptiveColumns) {
    return Array.from({ length: columns + 1 }, (_, column) =>
      Math.round((column * sourceWidth) / columns),
    );
  }

  const top = Math.round((row * sourceHeight) / rows);
  const bottom = Math.round(((row + 1) * sourceHeight) / rows);
  const boundaries = [0];
  for (let column = 1; column < columns; column += 1) {
    const ideal = Math.round((column * sourceWidth) / columns);
    const radius = Math.round(sourceWidth / 16);
    let gapStart = -1;
    let bestGap = null;
    for (let x = ideal - radius; x <= ideal + radius + 1; x += 1) {
      let occupied = false;
      if (x <= ideal + radius) {
        for (let y = top; y < bottom; y += 1) {
          if (data[(y * sourceWidth + x) * sourceChannels + 3] >= 24) {
            occupied = true;
            break;
          }
        }
      }
      if (!occupied && x <= ideal + radius && gapStart < 0) gapStart = x;
      if ((occupied || x > ideal + radius) && gapStart >= 0) {
        const end = x - 1;
        const width = end - gapStart + 1;
        const middle = Math.round((gapStart + end) / 2);
        const score = Math.abs(middle - ideal) - width / 4;
        if (width >= 4 && (!bestGap || score < bestGap.score)) {
          bestGap = { middle, score };
        }
        gapStart = -1;
      }
    }
    if (!bestGap) throw new Error(`Separacao das poses ausente na linha ${row + 1}.`);
    boundaries.push(bestGap.middle);
  }
  boundaries.push(sourceWidth);
  return boundaries;
}

function isolatePose(left, top, width, height) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const components = [];

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start]) continue;
    visited[start] = 1;
    const startX = start % width;
    const startY = Math.floor(start / width);
    if (data[((top + startY) * sourceWidth + left + startX) * sourceChannels + 3] < 24) {
      continue;
    }
    const pixels = [start];
    let minX = startX;
    let maxX = startX;
    let minY = startY;
    let maxY = startY;
    for (let head = 0; head < pixels.length; head += 1) {
      const index = pixels[head];
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (visited[next]) continue;
          visited[next] = 1;
          if (data[((top + nextY) * sourceWidth + left + nextX) * sourceChannels + 3] < 24) {
            continue;
          }
          pixels.push(next);
          minX = Math.min(minX, nextX);
          maxX = Math.max(maxX, nextX);
          minY = Math.min(minY, nextY);
          maxY = Math.max(maxY, nextY);
        }
      }
    }
    components.push({ pixels, minX, maxX, minY, maxY });
  }

  if (!components.length) throw new Error(`Pose vazia em ${left}, ${top}.`);
  components.sort((a, b) => b.pixels.length - a.pixels.length);
  const subject = components[0];
  const keep = new Uint8Array(pixelCount);
  for (const component of components) {
    const gapX = Math.max(subject.minX - component.maxX, component.minX - subject.maxX, 0);
    const gapY = Math.max(subject.minY - component.maxY, component.minY - subject.maxY, 0);
    if (component !== subject && (gapX > 12 || gapY > 12)) continue;
    for (const pixel of component.pixels) keep[pixel] = 1;
  }

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  const rgba = Buffer.alloc(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    if (!keep[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const source = ((top + y) * sourceWidth + left + x) * sourceChannels;
    data.copy(rgba, index * 4, source, source + 4);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    image: rgba,
    imageWidth: width,
    imageHeight: height,
  };
}

for (let row = 0; row < rows; row += 1) {
  const boundaries = getColumnBoundaries(row);
  for (let column = 0; column < columns; column += 1) {
    const cellLeft = boundaries[column];
    const cellRight = boundaries[column + 1];
    const cellTop = Math.round((row * sourceHeight) / rows);
    const cellBottom = Math.round(((row + 1) * sourceHeight) / rows);
    const isolated = isolatePose(
      cellLeft,
      cellTop,
      cellRight - cellLeft,
      cellBottom - cellTop,
    );
    poses.push({
      row,
      column,
      ...isolated,
    });
  }
}

const walkPoses = poses.filter((pose) => pose.column === 0);
const baseScale = Math.min(
  (frameWidth - 8) / Math.max(...walkPoses.map((pose) => pose.width)),
  (frameHeight - 6) / Math.max(...walkPoses.map((pose) => pose.height)),
);
const overlays = [];
for (const pose of poses) {
  const scale = Math.min(
    baseScale,
    (frameWidth - 8) / pose.width,
    (frameHeight - 6) / pose.height,
  );
  const width = Math.max(1, Math.round(pose.width * scale));
  const height = Math.max(1, Math.round(pose.height * scale));
  const sprite = await sharp(pose.image, {
    raw: {
      width: pose.imageWidth,
      height: pose.imageHeight,
      channels: 4,
    },
  })
    .extract({
      left: pose.left,
      top: pose.top,
      width: pose.width,
      height: pose.height,
    })
    .resize(width, height, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  overlays.push({
    input: sprite,
    left: pose.column * frameWidth + Math.floor((frameWidth - width) / 2),
    top: pose.row * frameHeight + frameHeight - height - 2,
  });
}

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await sharp({
  create: {
    width: frameWidth * columns,
    height: frameHeight * rows,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(overlays)
  .png({ compressionLevel: 9 })
  .toFile(path.resolve(outputPath));

console.log(`16 poses normalizadas em ${outputPath}.`);
