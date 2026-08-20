import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const APPLY = process.argv.includes('--apply');
const formatArgument = process.argv.find((argument) =>
  argument.startsWith('--format='),
);
const FORMAT = formatArgument?.split('=')[1] ?? 'webp';
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.IMAGE_JOBS) || 4));
const IMAGE_ROOT = path.resolve(process.cwd(), 'src', 'assets', 'images');
const SOURCE_ROOT = path.resolve(process.cwd(), 'src');
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.json', '.ts', '.tsx']);

if (!['webp', 'avif'].includes(FORMAT)) {
  throw new Error(`Formato inválido: ${FORMAT}. Use webp ou avif.`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    }),
  );

  return nested.flat();
}

async function mapWithConcurrency(values, mapper) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, values.length) }, () => worker()),
  );
}

async function retryFileOperation(operation, attempts = 12) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!['EBUSY', 'EPERM'].includes(error?.code) || attempt === attempts - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  throw lastError;
}

async function convertImage(sourcePath) {
  const parsedPath = path.parse(sourcePath);
  const outputPath = path.join(parsedPath.dir, `${parsedPath.name}.${FORMAT}`);
  const temporaryPath = `${outputPath}.tmp`;
  const sourceMetadata = await sharp(sourcePath).metadata();
  const pipeline = sharp(sourcePath, { failOn: 'error' });

  if (FORMAT === 'avif') {
    pipeline.avif({ quality: 56, effort: 5, chromaSubsampling: '4:4:4' });
  } else {
    pipeline.webp({
      quality: 84,
      alphaQuality: 96,
      effort: 5,
      smartSubsample: true,
    });
  }

  await mkdir(parsedPath.dir, { recursive: true });
  await retryFileOperation(() => rm(temporaryPath, { force: true }));
  await retryFileOperation(() => rm(outputPath, { force: true }));
  await pipeline.toFile(outputPath);

  const outputMetadata = await sharp(outputPath).metadata();

  if (
    sourceMetadata.width !== outputMetadata.width ||
    sourceMetadata.height !== outputMetadata.height ||
    (sourceMetadata.hasAlpha && !outputMetadata.hasAlpha)
  ) {
    await retryFileOperation(() => rm(outputPath, { force: true }));
    throw new Error(`Validação visual falhou para ${sourcePath}.`);
  }

  const [sourceStats, outputStats] = await Promise.all([
    stat(sourcePath),
    stat(outputPath),
  ]);

  return {
    sourcePath,
    outputPath,
    sourceBytes: sourceStats.size,
    outputBytes: outputStats.size,
  };
}

async function rewriteAssetReferences() {
  const textFiles = (await walk(SOURCE_ROOT)).filter((filePath) =>
    TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  );
  let changedFiles = 0;

  for (const filePath of textFiles) {
    const current = await readFile(filePath, 'utf8');
    const next = current.replace(/\.png(?=["'`)])/gi, `.${FORMAT}`);

    if (next !== current) {
      await writeFile(filePath, next, 'utf8');
      changedFiles += 1;
    }
  }

  return changedFiles;
}

async function main() {
  const sourceImages = (await walk(IMAGE_ROOT)).filter(
    (filePath) => path.extname(filePath).toLowerCase() === '.png',
  );
  const sourceBytes = (
    await Promise.all(sourceImages.map((filePath) => stat(filePath)))
  ).reduce((total, fileStats) => total + fileStats.size, 0);

  console.log(
    JSON.stringify({
      mode: APPLY ? 'apply' : 'dry-run',
      format: FORMAT,
      images: sourceImages.length,
      sourceMiB: Number((sourceBytes / 1024 / 1024).toFixed(2)),
      concurrency: CONCURRENCY,
    }),
  );

  if (!APPLY || sourceImages.length === 0) return;

  const conversions = [];
  await mapWithConcurrency(sourceImages, async (sourcePath) => {
    conversions.push(await convertImage(sourcePath));
  });

  const outputBytes = conversions.reduce(
    (total, conversion) => total + conversion.outputBytes,
    0,
  );

  await Promise.all(
    conversions.map((conversion) => rm(conversion.sourcePath, { force: true })),
  );
  const changedReferences = await rewriteAssetReferences();

  console.log(
    JSON.stringify({
      converted: conversions.length,
      changedReferences,
      outputMiB: Number((outputBytes / 1024 / 1024).toFixed(2)),
      reductionPercent: Number(
        ((1 - outputBytes / Math.max(sourceBytes, 1)) * 100).toFixed(2),
      ),
    }),
  );
}

await main();
