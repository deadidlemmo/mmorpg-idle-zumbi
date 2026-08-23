import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const imageRoot = path.resolve(
  'src/assets/images/items/equipments',
);
const expectedStarterImagePaths = new Set(
  [
    'assassino/adagas/t00-faca-de-aprendiz.webp',
    'assassino/bombas/t00-lamina-reserva-de-aprendiz.webp',
    'assassino/capuz/t00-capuz-de-aprendiz.webp',
    'assassino/perneiras/t00-perneiras-de-aprendiz.webp',
    'assassino/sapatilhas/t00-sapatilhas-de-aprendiz.webp',
    'assassino/traje/t00-jaqueta-leve-de-aprendiz.webp',
    'atirador/cargueiras/t00-cargueira-de-aprendiz.webp',
    'atirador/carregador/t00-carregador-de-aprendiz.webp',
    'atirador/coturnos/t00-coturnos-de-aprendiz.webp',
    'atirador/jaqueta/t00-jaqueta-de-patrulha-aprendiz.webp',
    'atirador/pistola/t00-pistola-de-aprendiz.webp',
    'atirador/viseira/t00-viseira-de-aprendiz.webp',
    'lutador/armadura/t00-colete-pesado-de-aprendiz.webp',
    'lutador/botas/t00-botas-de-aprendiz.webp',
    'lutador/elmo/t00-capacete-de-aprendiz.webp',
    'lutador/escudo/t00-tampa-de-aprendiz.webp',
    'lutador/grevas/t00-calca-reforcada-de-aprendiz.webp',
    'lutador/maca/t00-porrete-de-aprendiz.webp',
    'medico/calcas/t00-calcas-clinicas-de-aprendiz.webp',
    'medico/colete/t00-colete-clinico-de-aprendiz.webp',
    'medico/injetor/t00-injetor-de-aprendiz.webp',
    'medico/mascara/t00-mascara-de-aprendiz.webp',
    'medico/sapatos/t00-sapatos-clinicos-de-aprendiz.webp',
    'medico/serra/t00-serra-de-aprendiz.webp',
  ].map((filePath) => path.normalize(filePath)),
);
const contactSheetArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--contact-sheet='));
const contactSheetPath = contactSheetArgument
  ? path.resolve(contactSheetArgument.split('=').slice(1).join('='))
  : null;

async function listWebpFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listWebpFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.webp')) {
      files.push(entryPath);
    }
  }

  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function inspectImage(filePath) {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const { data, info } = await image.ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  let visiblePixels = 0;
  let saturatedAccentPixels = 0;

  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index + 3] <= 24) continue;

    visiblePixels += 1;
    const maximum = Math.max(data[index], data[index + 1], data[index + 2]);
    const minimum = Math.min(data[index], data[index + 1], data[index + 2]);

    if (maximum >= 80 && maximum - minimum >= 45) {
      saturatedAccentPixels += 1;
    }
  }

  const coverage = visiblePixels / (info.width * info.height);
  const tier = Number(path.basename(filePath).match(/^t(\d{2})-/)?.[1]);

  assert(metadata.width === 512 && metadata.height === 512, `${filePath}: expected 512x512.`);
  assert(metadata.hasAlpha, `${filePath}: missing alpha channel.`);
  assert(coverage >= 0.025 && coverage <= 0.9, `${filePath}: suspicious visible coverage ${coverage.toFixed(3)}.`);
  assert(Number.isInteger(tier) && tier >= 0 && tier <= 5, `${filePath}: invalid tier prefix.`);
  assert(
    tier < 3 || saturatedAccentPixels / visiblePixels >= 0.01,
    `${filePath}: tier ${tier} has no meaningful tier-color accent.`,
  );

  return { filePath, tier, coverage };
}

async function buildContactSheet(results) {
  if (!contactSheetPath) return;

  const tileSize = 128;
  const columns = 10;
  const rows = Math.ceil(results.length / columns);
  const checker = Buffer.from(
    `<svg width="${tileSize}" height="${tileSize}" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse">
        <rect width="32" height="32" fill="#15191b"/>
        <path d="M0 0h16v16H0zM16 16h16v16H16z" fill="#252b2e"/>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#c)"/>
    </svg>`,
  );
  const composites = [];

  for (let index = 0; index < results.length; index += 1) {
    const left = (index % columns) * tileSize;
    const top = Math.floor(index / columns) * tileSize;
    const input = await sharp(results[index].filePath)
      .resize(tileSize - 8, tileSize - 8, { fit: 'contain' })
      .png()
      .toBuffer();

    composites.push({ input, left: left + 4, top: top + 4 });
  }

  await mkdir(path.dirname(contactSheetPath), { recursive: true });
  await sharp(checker)
    .resize(columns * tileSize, rows * tileSize, { fit: 'fill' })
    .composite(composites)
    .png()
    .toFile(contactSheetPath);
}

const files = (await listWebpFiles(imageRoot)).sort();
assert(files.length === 164, `Expected 164 equipment images, found ${files.length}.`);

const starterImagePaths = files
  .filter((filePath) => path.basename(filePath).startsWith('t00-'))
  .map((filePath) => path.relative(imageRoot, filePath));

assert(
  starterImagePaths.length === expectedStarterImagePaths.size,
  `Expected ${expectedStarterImagePaths.size} starter images, found ${starterImagePaths.length}.`,
);

for (const starterImagePath of expectedStarterImagePaths) {
  assert(
    starterImagePaths.includes(starterImagePath),
    `Missing starter equipment image: ${starterImagePath}.`,
  );
}

const familyCounts = new Map();

for (const filePath of files) {
  const family = path.dirname(filePath);
  familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
}

assert(familyCounts.size === 28, `Expected 28 equipment families, found ${familyCounts.size}.`);

for (const [family, count] of familyCounts) {
  const starterImagePath = starterImagePaths.find(
    (filePath) => path.dirname(path.join(imageRoot, filePath)) === family,
  );
  const expectedCount = starterImagePath ? 6 : 5;

  assert(
    count === expectedCount,
    `${family}: expected ${expectedCount} tier images, found ${count}.`,
  );
}

const results = [];

for (const filePath of files) {
  results.push(await inspectImage(filePath));
}

await buildContactSheet(results);

const averageCoverage = results.reduce((sum, result) => sum + result.coverage, 0) / results.length;
console.log(
  `Equipment art audit passed: ${results.length} images, ${familyCounts.size} families, average coverage ${(averageCoverage * 100).toFixed(1)}%.`,
);
