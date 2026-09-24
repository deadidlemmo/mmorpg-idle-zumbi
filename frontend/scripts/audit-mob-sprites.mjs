import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOBS_DIR = path.resolve(
  SCRIPT_DIR,
  "../src/assets/images/auto-combat/mobs",
);
const REQUIRED_ANIMATIONS = ["walk", "attack", "hurt", "death"];

const mobDirectories = (await fs.readdir(MOBS_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const directory of mobDirectories) {
  const mobDirectory = path.join(MOBS_DIR, directory);
  const manifestName = (await fs.readdir(mobDirectory)).find((name) =>
    name.endsWith(".animations.json"),
  );
  if (!manifestName) continue;

  const manifest = JSON.parse(
    await fs.readFile(path.join(mobDirectory, manifestName), "utf8"),
  );
  const directionCount = Object.keys(manifest.directionRows ?? {}).length;
  if (directionCount !== 4) {
    throw new Error(
      `${manifestName}: devem existir exatamente quatro direcoes.`,
    );
  }

  for (const animationName of REQUIRED_ANIMATIONS) {
    const animation = manifest.animations?.[animationName];
    if (!animation) {
      throw new Error(
        `${manifestName}: animacao obrigatoria ausente: ${animationName}.`,
      );
    }
    const sheetPath = path.join(mobDirectory, animation.sheet);
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
    if (!alpha || alpha.min !== 0 || alpha.max < 250) {
      throw new Error(
        `${animation.sheet}: a folha precisa combinar transparencia real e pixels opacos.`,
      );
    }
  }

  console.log(`${manifest.mobKey}: contrato visual valido.`);
}
