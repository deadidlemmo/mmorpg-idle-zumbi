import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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
    if (
      manifest.actorKey.startsWith("class-") &&
      (animationName === "walk" || animationName === "attack") &&
      animation.framesPerDirection !== 8
    ) {
      throw new Error(`${animation.sheet}: a classe precisa de oito quadros por direcao.`);
    }
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
    if (animation.framesPerDirection === 8) {
      const walkHeights = [];
      const walkFootLines = [];
      for (let row = 0; row < directionCount; row += 1) {
        const signatures = new Set();
        for (let column = 0; column < 8; column += 1) {
          const frame = await sharp(sheetPath)
            .extract({
              left: column * manifest.frame.width,
              top: row * manifest.frame.height,
              width: manifest.frame.width,
              height: manifest.frame.height,
            })
            .raw()
            .toBuffer();
          signatures.add(createHash("sha256").update(frame).digest("hex"));
          if (animationName === "walk") {
            let top = manifest.frame.height;
            let bottom = -1;
            for (let y = 0; y < manifest.frame.height; y += 1) {
              for (let x = 0; x < manifest.frame.width; x += 1) {
                if (frame[(y * manifest.frame.width + x) * 4 + 3] < 16) continue;
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
            }
            walkHeights.push(bottom - top + 1);
            walkFootLines.push(bottom);
          }
        }
        if (signatures.size < 6) {
          throw new Error(`${animation.sheet}: quadros repetidos na direcao ${row + 1}.`);
        }
      }
      if (animationName === "walk" && (
        Math.max(...walkHeights) - Math.min(...walkHeights) > 8 ||
        Math.max(...walkFootLines) - Math.min(...walkFootLines) > 1
      )) {
        throw new Error(`${animation.sheet}: escala ou linha dos pes varia entre os quadros.`);
      }
    }
  }
  console.log(`${manifest.actorKey}: contrato visual valido.`);
}
