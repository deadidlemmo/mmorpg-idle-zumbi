import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

function isNeutralLight(data, offset, minimum = 230, tolerance = 10) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const lowest = Math.min(red, green, blue);
  const highest = Math.max(red, green, blue);

  return lowest >= minimum && highest - lowest <= tolerance;
}

function removeConnectedCheckerboard(data, width, height, channels) {
  const pixelCount = width * height;
  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;

  function enqueue(pixelIndex) {
    if (background[pixelIndex]) return;
    if (!isNeutralLight(data, pixelIndex * channels)) return;
    background[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
  }

  for (let x = 0; x < width; x += 1) enqueue(x);
  for (let y = 0; y < Math.floor(height * 0.7); y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  const cornerSpan = Math.max(1, Math.floor(width * 0.18));
  for (let x = 0; x < cornerSpan; x += 1) {
    enqueue((height - 1) * width + x);
    enqueue((height - 1) * width + width - 1 - x);
  }

  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }

  // Remove também células claras cercadas por fios de cabelo ou equipamentos.
  // O limiar estrito preserva os tons quentes e esverdeados das roupas claras.
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (isNeutralLight(data, pixelIndex * channels, 198, 14)) {
      background[pixelIndex] = 1;
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const additions = [];
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (background[pixelIndex]) continue;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const touchesBackground =
        (x > 0 && background[pixelIndex - 1]) ||
        (x + 1 < width && background[pixelIndex + 1]) ||
        (y > 0 && background[pixelIndex - width]) ||
        (y + 1 < height && background[pixelIndex + width]);

      if (
        touchesBackground &&
        isNeutralLight(data, pixelIndex * channels, 180, 22)
      ) {
        additions.push(pixelIndex);
      }
    }
    for (const pixelIndex of additions) background[pixelIndex] = 1;
  }

  // Recua a silhueta dois pixels para eliminar a franja já misturada ao
  // quadriculado durante a geração. Em 1024px isso preserva o desenho externo.
  for (let pass = 0; pass < 2; pass += 1) {
    const additions = [];
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (background[pixelIndex]) continue;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      if (
        (x > 0 && background[pixelIndex - 1]) ||
        (x + 1 < width && background[pixelIndex + 1]) ||
        (y > 0 && background[pixelIndex - width]) ||
        (y + 1 < height && background[pixelIndex + width])
      ) {
        additions.push(pixelIndex);
      }
    }
    for (const pixelIndex of additions) background[pixelIndex] = 1;
  }

  const rgba = Buffer.alloc(pixelCount * 4);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const sourceOffset = pixelIndex * channels;
    const targetOffset = pixelIndex * 4;
    rgba[targetOffset] = data[sourceOffset];
    rgba[targetOffset + 1] = data[sourceOffset + 1];
    rgba[targetOffset + 2] = data[sourceOffset + 2];
    rgba[targetOffset + 3] = background[pixelIndex] ? 0 : 255;
  }

  return rgba;
}

async function main() {
  const [sourcePath, destinationPath] = process.argv.slice(2);
  if (!sourcePath || !destinationPath) {
    throw new Error(
      'Uso: node scripts/remove-checkerboard-background.mjs <origem> <destino>',
    );
  }

  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = removeConnectedCheckerboard(
    data,
    info.width,
    info.height,
    info.channels,
  );

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .resize({
      width: 1024,
      height: 1024,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(destinationPath);

  const output = await sharp(destinationPath).metadata();
  if (!output.hasAlpha) {
    throw new Error(`A saída não possui alfa: ${destinationPath}`);
  }

  console.log(
    `${path.basename(destinationPath)} ${output.width}x${output.height} alpha=true`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
