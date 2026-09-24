import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [inputPath, outputPath, columnsValue, rowsValue] = process.argv.slice(2);
const columns = Math.max(1, Number.parseInt(columnsValue ?? "", 10));
const rows = Math.max(1, Number.parseInt(rowsValue ?? "", 10));
const frameWidth = 112;
const frameHeight = 96;
const expectedComponents = columns * rows;

if (!inputPath || !outputPath || !Number.isFinite(columns) || !Number.isFinite(rows)) {
  throw new Error(
    "Uso: node scripts/prepare-generated-combat-sprite.mjs <entrada.png> <saida.png> <colunas> <linhas>",
  );
}

const source = sharp(path.resolve(inputPath)).ensureAlpha();
const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
const pixels = info.width * info.height;
const foreground = new Uint8Array(pixels);
const visited = new Uint8Array(pixels);

for (let index = 0; index < pixels; index += 1) {
  const offset = index * 4;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const brightness = (red + green + blue) / 3;
  const generatedBackdrop = maximum - minimum <= 20 && brightness >= 145;
  if (data[offset + 3] > 0 && !generatedBackdrop) foreground[index] = 1;
  if (generatedBackdrop) data[offset + 3] = 0;
}

const components = [];
for (let index = 0; index < pixels; index += 1) {
  if (!foreground[index] || visited[index]) continue;
  const queue = [index];
  let head = 0;
  let count = 0;
  let minimumX = info.width;
  let minimumY = info.height;
  let maximumX = 0;
  let maximumY = 0;
  visited[index] = 1;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const x = current % info.width;
    const y = Math.floor(current / info.width);
    count += 1;
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (
          neighborX < 0 ||
          neighborY < 0 ||
          neighborX >= info.width ||
          neighborY >= info.height
        ) {
          continue;
        }
        const neighbor = neighborY * info.width + neighborX;
        if (foreground[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
  }

  if (count > 100) {
    components.push({
      count,
      left: minimumX,
      top: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1,
      centerX: (minimumX + maximumX) / 2,
      centerY: (minimumY + maximumY) / 2,
    });
  }
}

const selected = components
  .sort((left, right) => right.count - left.count)
  .slice(0, expectedComponents)
  .sort((left, right) => left.centerY - right.centerY);

if (selected.length !== expectedComponents) {
  throw new Error(
    `Esperados ${expectedComponents} personagens isolados, encontrados ${selected.length}.`,
  );
}

const ordered = [];
for (let row = 0; row < rows; row += 1) {
  ordered.push(
    ...selected
      .slice(row * columns, (row + 1) * columns)
      .sort((left, right) => left.centerX - right.centerX),
  );
}

const largestHeight = Math.max(...ordered.map((component) => component.height));
const largestWidth = Math.max(...ordered.map((component) => component.width));
const scale = Math.min(
  (frameHeight - 6) / largestHeight,
  (frameWidth - 8) / largestWidth,
);
const overlays = [];

for (let index = 0; index < ordered.length; index += 1) {
  const component = ordered[index];
  const width = Math.max(1, Math.round(component.width * scale));
  const height = Math.max(1, Math.round(component.height * scale));
  const sprite = await sharp(data, { raw: info })
    .extract({
      left: component.left,
      top: component.top,
      width: component.width,
      height: component.height,
    })
    .resize(width, height, { kernel: "nearest" })
    .png()
    .toBuffer();
  const column = index % columns;
  const row = Math.floor(index / columns);
  overlays.push({
    input: sprite,
    left: column * frameWidth + Math.round((frameWidth - width) / 2),
    top: row * frameHeight + frameHeight - 3 - height,
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
  .png()
  .toFile(path.resolve(outputPath));

console.log(
  `Folha pronta: ${path.resolve(outputPath)} (${frameWidth * columns}x${frameHeight * rows})`,
);
