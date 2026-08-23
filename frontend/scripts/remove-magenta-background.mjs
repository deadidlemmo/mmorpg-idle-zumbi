import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

function isChroma(data, offset, relaxed = false, chroma = "magenta") {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  if (chroma === "green") {
    const dominance = green - Math.max(red, blue);
    return relaxed
      ? green >= 40 && dominance >= 15
      : green >= 155 && red <= 155 && blue <= 155 && dominance >= 65;
  }
  const minimumMagenta = Math.min(red, blue);
  const dominance = minimumMagenta - green;

  return relaxed
    ? red >= 40 &&
        blue >= 40 &&
        dominance >= 15 &&
        Math.abs(red - blue) <= 100
    : red >= 155 && blue >= 155 && green <= 155 && dominance >= 65;
}

function removeConnectedChroma(data, width, height, channels, chroma) {
  const pixelCount = width * height;
  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;

  function enqueue(pixelIndex, relaxed = false) {
    if (background[pixelIndex]) return;
    if (!isChroma(data, pixelIndex * channels, relaxed, chroma)) return;
    background[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
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

  // O recorte pode conter vãos fechados entre cabelo e equipamento. Como o
  // personagem é gerado sem magenta, a mesma chave pode ser removida nesses
  // vãos sem depender de conexão com a borda.
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (isChroma(data, pixelIndex * channels, true, chroma)) {
      background[pixelIndex] = 1;
    }
  }

  // Inclui a mistura magenta da antialiasing somente quando ela toca o fundo.
  for (let pass = 0; pass < 3; pass += 1) {
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
        isChroma(data, pixelIndex * channels, true, chroma)
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
  const [sourcePath, destinationPath, chroma = "magenta"] =
    process.argv.slice(2);
  if (!sourcePath || !destinationPath) {
    throw new Error(
      "Uso: node scripts/remove-magenta-background.mjs <origem> <destino> [magenta|green]",
    );
  }
  if (!new Set(["magenta", "green"]).has(chroma)) {
    throw new Error(`Chroma inválido: ${chroma}.`);
  }

  const { data, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = removeConnectedChroma(
    data,
    info.width,
    info.height,
    info.channels,
    chroma,
  );

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize({
      width: 1024,
      height: 1024,
      fit: "contain",
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
