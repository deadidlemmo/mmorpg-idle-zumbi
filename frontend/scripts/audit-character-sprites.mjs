import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHARACTER_DIR = path.resolve(
  SCRIPT_DIR,
  "../src/assets/images/auto-combat/characters",
);
const REQUIRED_ANIMATIONS = [
  "walk",
  "investigate",
  "attack",
  "hurt",
  "death",
];

const actorDirectories = (await fs.readdir(CHARACTER_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const directory of actorDirectories) {
  const actorDirectory = path.join(CHARACTER_DIR, directory);
  const manifestName = (await fs.readdir(actorDirectory)).find((name) =>
    name.endsWith(".animations.json"),
  );
  if (!manifestName) continue;
  const manifest = JSON.parse(
    await fs.readFile(path.join(actorDirectory, manifestName), "utf8"),
  );
  const directionCount = Object.keys(manifest.directionRows ?? {}).length;
  if (directionCount !== 4) {
    throw new Error(`${manifestName}: devem existir exatamente quatro direcoes.`);
  }

  for (const animationName of REQUIRED_ANIMATIONS) {
    const animation = manifest.animations?.[animationName];
    if (!animation) {
      throw new Error(`${manifestName}: animacao obrigatoria ausente: ${animationName}.`);
    }
    const sheetPath = path.join(actorDirectory, animation.sheet);
    const metadata = await sharp(sheetPath).metadata();
    const expectedWidth =
      manifest.frame.width * animation.framesPerDirection;
    const expectedHeight = manifest.frame.height * directionCount;
    if (
      metadata.width !== expectedWidth ||
      metadata.height !== expectedHeight
    ) {
      throw new Error(
        `${animation.sheet}: esperado ${expectedWidth}x${expectedHeight}, recebido ${metadata.width}x${metadata.height}.`,
      );
    }
    if (!metadata.hasAlpha) {
      throw new Error(`${animation.sheet}: a folha precisa possuir canal alpha.`);
    }
    const stats = await sharp(sheetPath).stats();
    const alpha = stats.channels[3];
    if (!alpha || alpha.min !== 0 || alpha.max !== 255) {
      throw new Error(
        `${animation.sheet}: a folha precisa combinar transparencia real e pixels opacos.`,
      );
    }
  }
  console.log(`${manifest.actorKey}: contrato visual valido.`);
}
