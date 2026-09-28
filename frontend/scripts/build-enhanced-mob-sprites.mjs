import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOBS_DIR = path.resolve(
  SCRIPT_DIR,
  "../src/assets/images/auto-combat/mobs",
);
const SOURCE_SUFFIX = "-v1";
const TARGET_SUFFIX = "-v2";
const requestedMob = process.argv
  .find((argument) => argument.startsWith("--only="))
  ?.slice("--only=".length);

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

function enhanceOpaquePixels(original, blurred, info) {
  const result = Buffer.from(original);

  for (let offset = 0; offset < result.length; offset += 4) {
    const alpha = original[offset + 3];
    if (alpha === 0) continue;

    const red = original[offset];
    const green = original[offset + 1];
    const blue = original[offset + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const channels = [red, green, blue];

    for (let channel = 0; channel < 3; channel += 1) {
      const detailed = channels[channel] +
        (channels[channel] - blurred[offset + channel]) * 0.7;
      const saturated = luminance + (detailed - luminance) * 1.1;
      const contrasted = (saturated - 112) * 1.07 + 112;
      result[offset + channel] = clampByte(contrasted + 2);
    }

    if (alpha < 210) {
      result[offset] = clampByte(result[offset] * 0.92);
      result[offset + 1] = clampByte(result[offset + 1] * 0.92);
      result[offset + 2] = clampByte(result[offset + 2] * 0.92);
    }
  }

  addOuterContour(result, original, info);
  addDirectionalRim(result, original, info);
  return result;
}

function addOuterContour(result, original, info) {
  const { width, height } = info;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (original[offset + 3] >= 24) continue;

      let strongestAlpha = 0;
      let sourceOffset = -1;
      for (let neighborY = Math.max(0, y - 1); neighborY <= Math.min(height - 1, y + 1); neighborY += 1) {
        for (let neighborX = Math.max(0, x - 1); neighborX <= Math.min(width - 1, x + 1); neighborX += 1) {
          if (neighborX === x && neighborY === y) continue;
          const neighborOffset = (neighborY * width + neighborX) * 4;
          const neighborAlpha = original[neighborOffset + 3];
          if (neighborAlpha > strongestAlpha) {
            strongestAlpha = neighborAlpha;
            sourceOffset = neighborOffset;
          }
        }
      }

      if (strongestAlpha < 92 || sourceOffset < 0) continue;
      result[offset] = clampByte(original[sourceOffset] * 0.2 + 5);
      result[offset + 1] = clampByte(original[sourceOffset + 1] * 0.2 + 7);
      result[offset + 2] = clampByte(original[sourceOffset + 2] * 0.18 + 6);
      result[offset + 3] = clampByte(strongestAlpha * 0.58);
    }
  }
}

function addDirectionalRim(result, original, info) {
  const { width, height } = info;

  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = original[offset + 3];
      if (alpha < 128) continue;

      const upperLeftAlpha = original[((y - 1) * width + x - 1) * 4 + 3];
      if (upperLeftAlpha > 36) continue;

      result[offset] = clampByte(result[offset] + 10);
      result[offset + 1] = clampByte(result[offset + 1] + 8);
      result[offset + 2] = clampByte(result[offset + 2] + 4);
    }
  }
}

async function enhanceFrame(frame) {
  const { data: original, info } = await sharp(frame)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurred = await sharp(original, { raw: info })
    .blur(0.45)
    .raw()
    .toBuffer();
  const enhanced = enhanceOpaquePixels(original, blurred, info);

  return sharp(enhanced, { raw: info }).png().toBuffer();
}

async function enhanceSheet(sourcePath, targetPath, manifest, animation) {
  const frameWidth = manifest.frame.width;
  const frameHeight = manifest.frame.height;
  const directionCount = Object.keys(manifest.directionRows).length;
  const source = sharp(sourcePath).ensureAlpha();
  const composites = [];

  for (let row = 0; row < directionCount; row += 1) {
    for (let column = 0; column < animation.framesPerDirection; column += 1) {
      const frame = await source
        .clone()
        .extract({
          left: column * frameWidth,
          top: row * frameHeight,
          width: frameWidth,
          height: frameHeight,
        })
        .png()
        .toBuffer();
      composites.push({
        input: await enhanceFrame(frame),
        left: column * frameWidth,
        top: row * frameHeight,
      });
    }
  }

  await sharp({
    create: {
      width: frameWidth * animation.framesPerDirection,
      height: frameHeight * directionCount,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, palette: true, quality: 100, colours: 256 })
    .toFile(targetPath);
}

const directories = (await fs.readdir(MOBS_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.endsWith(SOURCE_SUFFIX))
  .map((entry) => entry.name)
  .filter((name) => !requestedMob || name === requestedMob)
  .sort();

if (requestedMob && directories.length === 0) {
  throw new Error(`Monstro fonte nao encontrado: ${requestedMob}`);
}

for (const sourceDirectoryName of directories) {
  const sourceDirectory = path.join(MOBS_DIR, sourceDirectoryName);
  const targetDirectoryName = `${sourceDirectoryName.slice(0, -SOURCE_SUFFIX.length)}${TARGET_SUFFIX}`;
  const targetDirectory = path.join(MOBS_DIR, targetDirectoryName);
  const manifestName = (await fs.readdir(sourceDirectory)).find((name) =>
    name.endsWith(".animations.json"),
  );
  if (!manifestName) continue;

  const manifest = JSON.parse(
    await fs.readFile(path.join(sourceDirectory, manifestName), "utf8"),
  );
  await fs.mkdir(targetDirectory, { recursive: true });

  for (const animation of Object.values(manifest.animations)) {
    await enhanceSheet(
      path.join(sourceDirectory, animation.sheet),
      path.join(targetDirectory, animation.sheet),
      manifest,
      animation,
    );
  }

  const enhancedManifest = {
    ...manifest,
    schemaVersion: 2,
    rendering: {
      profile: "immersive-crisp-v2",
      contactShadow: "runtime",
      sourceSet: sourceDirectoryName,
    },
  };
  await fs.writeFile(
    path.join(targetDirectory, manifestName),
    `${JSON.stringify(enhancedManifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`${manifest.mobKey}: conjunto aprimorado em ${targetDirectoryName}.`);
}
