import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const argumentsByName = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [name, ...valueParts] = argument.replace(/^--/, '').split('=');
    return [name, valueParts.join('=')];
  }),
);
const inputPath = path.resolve(argumentsByName.input ?? '');
const outputDirectory = path.resolve(argumentsByName.output ?? '');
const slugs = String(argumentsByName.slugs ?? '')
  .split(',')
  .map((slug) => slug.trim())
  .filter(Boolean);

if (!argumentsByName.input || !argumentsByName.output || slugs.length !== 5) {
  throw new Error(
    'Use --input=<faixa.png> --output=<diretório> --slugs=<slug1,...,slug5>.',
  );
}

function getBorderKeyColor(data, info) {
  const sample = [];
  const stride = Math.max(1, Math.floor(Math.min(info.width, info.height) / 100));

  for (let x = 0; x < info.width; x += stride) {
    for (const y of [0, info.height - 1]) {
      const index = (y * info.width + x) * info.channels;
      sample.push([data[index], data[index + 1], data[index + 2]]);
    }
  }

  for (let y = 0; y < info.height; y += stride) {
    for (const x of [0, info.width - 1]) {
      const index = (y * info.width + x) * info.channels;
      sample.push([data[index], data[index + 1], data[index + 2]]);
    }
  }

  return [0, 1, 2].map((channel) => {
    const values = sample.map((pixel) => pixel[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
}

function removeMagentaBackground(data, info) {
  const key = getBorderKeyColor(data, info);
  const output = Buffer.alloc(info.width * info.height * 4);

  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const sourceIndex = pixel * info.channels;
    const outputIndex = pixel * 4;
    const red = data[sourceIndex];
    const green = data[sourceIndex + 1];
    const blue = data[sourceIndex + 2];
    const magentaDominance = Math.min(red, blue) - green;
    let alpha = 255;

    if (magentaDominance > 14) alpha = 0;

    const alphaRatio = alpha / 255;
    const recover = (channel, keyChannel) => {
      if (alpha <= 0) return 0;
      if (alpha >= 255) return channel;

      return Math.max(
        0,
        Math.min(255, Math.round((channel - (1 - alphaRatio) * keyChannel) / alphaRatio)),
      );
    };

    output[outputIndex] = recover(red, key[0]);
    output[outputIndex + 1] = recover(green, key[1]);
    output[outputIndex + 2] = recover(blue, key[2]);
    output[outputIndex + 3] = alpha;
  }

  return keepLargestAlphaComponent(output, info.width, info.height);
}

function keepLargestAlphaComponent(data, width, height) {
  const pixelCount = width * height;
  const componentByPixel = new Int32Array(pixelCount);
  let largestSize = 0;
  let nextComponent = 0;
  const componentSizes = [0];

  for (let start = 0; start < pixelCount; start += 1) {
    if (data[start * 4 + 3] <= 24 || componentByPixel[start] !== 0) continue;

    nextComponent += 1;
    const stack = [start];
    componentByPixel[start] = nextComponent;
    let componentSize = 0;

    while (stack.length > 0) {
      const pixel = stack.pop();
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      componentSize += 1;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;

          const nextX = x + offsetX;
          const nextY = y + offsetY;

          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            continue;
          }

          const nextPixel = nextY * width + nextX;

          if (
            componentByPixel[nextPixel] === 0 &&
            data[nextPixel * 4 + 3] > 24
          ) {
            componentByPixel[nextPixel] = nextComponent;
            stack.push(nextPixel);
          }
        }
      }
    }

    componentSizes[nextComponent] = componentSize;
    largestSize = Math.max(largestSize, componentSize);
  }

  // Paired equipment (boots, greaves and dual daggers) may be composed of
  // separate silhouettes. Keep every substantial component while discarding
  // chroma-key specks and fragments that bleed in from an adjacent strip cell.
  const minimumComponentSize = Math.max(80, Math.floor(largestSize * 0.12));

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (componentSizes[componentByPixel[pixel]] < minimumComponentSize) {
      data[pixel * 4 + 3] = 0;
    }
  }

  return data;
}

function enforceTierAccent(data, tier) {
  if (tier < 3) return data;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const saturation = maximum > 0 ? (maximum - minimum) / maximum : 0;

    if (maximum < 70 || saturation < 0.32) continue;

    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    if (tier <= 4) {
      data[index] = Math.min(255, Math.round(luminance * 1.42 + 32));
      data[index + 1] = Math.min(240, Math.round(luminance * 1.08 + 18));
      data[index + 2] = Math.min(90, Math.round(luminance * 0.2));
    } else {
      data[index] = Math.min(110, Math.round(luminance * 0.3));
      data[index + 1] = Math.min(255, Math.round(luminance * 1.35 + 24));
      data[index + 2] = Math.min(115, Math.round(luminance * 0.38));
    }
  }

  return data;
}

async function splitStrip() {
  const metadata = await sharp(inputPath).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('A faixa de origem não possui dimensões válidas.');
  }

  await mkdir(outputDirectory, { recursive: true });

  for (let tierIndex = 0; tierIndex < 5; tierIndex += 1) {
    const left = Math.floor((metadata.width * tierIndex) / 5);
    const right = Math.floor((metadata.width * (tierIndex + 1)) / 5);
    const { data, info } = await sharp(inputPath)
      .extract({
        left,
        top: 0,
        width: right - left,
        height: metadata.height,
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const transparentPixels = enforceTierAccent(
      removeMagentaBackground(data, info),
      tierIndex + 1,
    );
    const tierLabel = String(tierIndex + 1).padStart(2, '0');
    const outputPath = path.join(
      outputDirectory,
      `t${tierLabel}-${slugs[tierIndex]}.webp`,
    );

    await sharp(transparentPixels, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
      .resize(456, 456, {
        fit: 'contain',
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: 28,
        bottom: 28,
        left: 28,
        right: 28,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 88, alphaQuality: 100, effort: 5 })
      .toFile(outputPath);

    const outputMetadata = await sharp(outputPath).metadata();

    if (
      outputMetadata.width !== 512 ||
      outputMetadata.height !== 512 ||
      !outputMetadata.hasAlpha
    ) {
      throw new Error(`Saída inválida: ${outputPath}.`);
    }

    console.log(outputPath);
  }
}

await splitStrip();
