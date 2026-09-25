import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [inputPath, outputDirectory, assetPrefix, mobKey] = process.argv.slice(2);
const frameWidth = 112;
const frameHeight = 96;
const directionCount = 4;

if (!inputPath || !outputDirectory || !assetPrefix || !mobKey) {
  throw new Error(
    "Uso: node scripts/build-combat-mob-sprite-set.mjs <poses.png> <diretorio> <prefixo> <mob-key>",
  );
}

const resolvedInput = path.resolve(inputPath);
const resolvedOutput = path.resolve(outputDirectory);
const metadata = await sharp(resolvedInput).metadata();

if (
  metadata.width !== frameWidth * 4 ||
  metadata.height !== frameHeight * directionCount
) {
  throw new Error(
    `Folha de poses invalida: esperado ${frameWidth * 4}x${frameHeight * directionCount}, recebido ${metadata.width}x${metadata.height}.`,
  );
}

const poseSheet = sharp(resolvedInput).ensureAlpha();
const poses = [];
for (let row = 0; row < directionCount; row += 1) {
  poses[row] = [];
  for (let column = 0; column < 4; column += 1) {
    poses[row][column] = await poseSheet
      .clone()
      .extract({
        left: column * frameWidth,
        top: row * frameHeight,
        width: frameWidth,
        height: frameHeight,
      })
      .png()
      .toBuffer();
  }
}

function directionOffset(row, distance) {
  if (row === 0) return { x: 0, y: distance };
  if (row === 1) return { x: -distance, y: 0 };
  if (row === 2) return { x: distance, y: 0 };
  return { x: 0, y: -distance };
}

async function shiftedFrame(input, x = 0, y = 0, opacity = 1) {
  let frame = sharp(input).ensureAlpha();
  if (opacity < 1) {
    const { data, info } = await frame.raw().toBuffer({ resolveWithObject: true });
    for (let offset = 3; offset < data.length; offset += 4) {
      data[offset] = Math.round(data[offset] * opacity);
    }
    frame = sharp(data, { raw: info });
  }

  const clipped = await frame.png().toBuffer();
  return sharp({
    create: {
      width: frameWidth,
      height: frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: clipped, left: x, top: y }])
    .png()
    .toBuffer();
}

async function buildSheet(name, framesPerDirection, resolveFrame) {
  const composites = [];
  for (let row = 0; row < directionCount; row += 1) {
    for (let frame = 0; frame < framesPerDirection; frame += 1) {
      composites.push({
        input: await resolveFrame(row, frame),
        left: frame * frameWidth,
        top: row * frameHeight,
      });
    }
  }

  const fileName = `${assetPrefix}-${name}.png`;
  await sharp({
    create: {
      width: frameWidth * framesPerDirection,
      height: frameHeight * directionCount,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, palette: true, quality: 92 })
    .toFile(path.join(resolvedOutput, fileName));

  return fileName;
}

await fs.mkdir(resolvedOutput, { recursive: true });

const walkOffsets = [
  { x: -1, y: 0 },
  { x: 0, y: -2 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
];
const walk = await buildSheet("walk", 4, (row, frame) => {
  const offset = walkOffsets[frame];
  return shiftedFrame(poses[row][0], offset.x, offset.y);
});
const attack = await buildSheet("attack", 4, (row, frame) => {
  if (frame === 0 || frame === 3) return shiftedFrame(poses[row][0]);
  const offset = directionOffset(row, frame === 2 ? 3 : 1);
  return shiftedFrame(poses[row][1], offset.x, offset.y);
});
const hurt = await buildSheet("hurt", 2, (row, frame) =>
  frame === 0
    ? shiftedFrame(poses[row][0], -1, 0)
    : shiftedFrame(poses[row][2], 2, 1),
);
const death = await buildSheet("death", 6, (row, frame) => {
  if (frame === 0) return shiftedFrame(poses[row][0]);
  if (frame === 1) return shiftedFrame(poses[row][2], 1, 1);
  if (frame === 2) return shiftedFrame(poses[row][2], -1, 3, 0.9);
  if (frame === 3) return shiftedFrame(poses[row][3], 0, 0, 0.82);
  if (frame === 4) return shiftedFrame(poses[row][3], 0, 1, 0.92);
  return shiftedFrame(poses[row][3], 0, 2);
});

const manifest = {
  schemaVersion: 1,
  mobKey,
  frame: { width: frameWidth, height: frameHeight, originX: 0.5, originY: 1 },
  directionRows: { south: 0, west: 1, east: 2, north: 3 },
  animations: {
    walk: { sheet: walk, framesPerDirection: 4, frameRate: 7, repeat: -1 },
    attack: {
      sheet: attack,
      framesPerDirection: 4,
      frameRate: 9,
      repeat: 0,
      impactFrame: 2,
    },
    hurt: { sheet: hurt, framesPerDirection: 2, frameRate: 8, repeat: 0 },
    death: {
      sheet: death,
      framesPerDirection: 6,
      frameRate: 8,
      repeat: 0,
      holdFinalFrame: true,
    },
  },
};

await fs.writeFile(
  path.join(resolvedOutput, `${assetPrefix}.animations.json`),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Sprites de ${mobKey} gravados em ${resolvedOutput}.`);
