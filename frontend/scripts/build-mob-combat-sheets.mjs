import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [sourcePath, outputDirectory, filePrefix] = process.argv.slice(2);
const frameWidth = 112;
const frameHeight = 96;
const directions = ["down", "left", "right", "up"];

if (!sourcePath || !outputDirectory || !filePrefix) {
  throw new Error(
    "Uso: node scripts/build-mob-combat-sheets.mjs <direcoes.png> <pasta> <prefixo>",
  );
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const source = sharp(path.resolve(sourcePath)).ensureAlpha();
const metadata = await source.metadata();
if (metadata.width !== frameWidth || metadata.height !== frameHeight * 4) {
  throw new Error(
    `Folha direcional invalida: esperado ${frameWidth}x${frameHeight * 4}.`,
  );
}

const directionSprites = await Promise.all(
  directions.map(async (_, row) => {
    const rowBuffer = await sharp(path.resolve(sourcePath))
      .extract({
        left: 0,
        top: row * frameHeight,
        width: frameWidth,
        height: frameHeight,
      })
      .ensureAlpha()
      .png()
      .toBuffer();
    return sharp(rowBuffer)
      .trim({ background: transparent })
      .png()
      .toBuffer();
  }),
);

async function renderFrame(sprite, transform = {}) {
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  const inputMetadata = await sharp(sprite).metadata();
  const transformed = await sharp(sprite)
    .resize({
      width: Math.max(1, Math.round((inputMetadata.width ?? 1) * scaleX)),
      height: Math.max(1, Math.round((inputMetadata.height ?? 1) * scaleY)),
      fit: "fill",
      kernel: "nearest",
    })
    .rotate(transform.angle ?? 0, { background: transparent })
    .png()
    .toBuffer();
  const transformedMetadata = await sharp(transformed).metadata();
  const resized =
    (transformedMetadata.width ?? 1) > frameWidth ||
    (transformedMetadata.height ?? 1) > frameHeight
      ? await sharp(transformed)
          .resize({
            width: frameWidth,
            height: frameHeight,
            fit: "inside",
            kernel: "nearest",
          })
          .png()
          .toBuffer()
      : transformed;
  const renderedMetadata = await sharp(resized).metadata();
  const width = renderedMetadata.width ?? 1;
  const height = renderedMetadata.height ?? 1;
  const left = Math.max(
    0,
    Math.min(
      frameWidth - width,
      Math.round((frameWidth - width) / 2 + (transform.x ?? 0)),
    ),
  );
  const top = Math.max(
    0,
    Math.min(
      frameHeight - height,
      frameHeight - 3 - height + Math.round(transform.y ?? 0),
    ),
  );
  return sharp({
    create: {
      width: frameWidth,
      height: frameHeight,
      channels: 4,
      background: transparent,
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

function horizontalDirection(direction) {
  if (direction === "left") return -1;
  if (direction === "right") return 1;
  return direction === "down" ? 0.35 : -0.35;
}

const animations = {
  walk: directions.map(() => [
    {},
    { y: -2, angle: -1 },
    {},
    { y: -2, angle: 1 },
  ]),
  attack: directions.map((direction) => {
    const horizontal = horizontalDirection(direction);
    return [
      {},
      { x: horizontal * 2, y: -1, angle: horizontal * 2 },
      { x: horizontal * 6, y: -2, angle: horizontal * 5, scaleX: 1.04 },
      { x: horizontal * 2, angle: horizontal * 1.5 },
    ];
  }),
  hurt: directions.map((direction) => {
    const horizontal = horizontalDirection(direction);
    return [
      {},
      { x: -horizontal * 4, angle: -horizontal * 7, scaleY: 0.96 },
    ];
  }),
  death: directions.map((direction) => {
    const fall = direction === "left" || direction === "up" ? -1 : 1;
    return [
      {},
      { x: fall, angle: fall * 10 },
      { x: fall * 2, angle: fall * 25, scaleY: 0.98 },
      { x: fall * 3, angle: fall * 43, scaleY: 0.94 },
      { x: fall * 4, angle: fall * 63, scaleY: 0.88 },
      { x: fall * 4, angle: fall * 82, scaleY: 0.8 },
    ];
  }),
};

await fs.mkdir(path.resolve(outputDirectory), { recursive: true });
for (const [animationName, rows] of Object.entries(animations)) {
  const framesPerDirection = rows[0].length;
  const composites = [];
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < rows[row].length; column += 1) {
      composites.push({
        input: await renderFrame(directionSprites[row], rows[row][column]),
        left: column * frameWidth,
        top: row * frameHeight,
      });
    }
  }
  const outputPath = path.resolve(
    outputDirectory,
    `${filePrefix}-${animationName}.png`,
  );
  await sharp({
    create: {
      width: frameWidth * framesPerDirection,
      height: frameHeight * 4,
      channels: 4,
      background: transparent,
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
  console.log(`Folha pronta: ${outputPath}`);
}
