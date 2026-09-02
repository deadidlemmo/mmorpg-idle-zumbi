import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const cosmeticsRoot = path.resolve("src/assets/images/cosmetics");
const collections = [
  { key: "premium-ultimo-abrigo", expectedAvatarCount: 32 },
  { key: "premium-nucleo-helix", expectedAvatarCount: 32 },
  { key: "premium-protocolo-carmesim", expectedAvatarCount: 32 },
  { key: "acervo-do-abrigo", expectedAvatarCount: 2 },
];
const failures = [];
let avatarCount = 0;

for (const collection of collections) {
  const directory = path.join(cosmeticsRoot, collection.key);
  const files = (await fs.readdir(directory)).filter(
    (file) => file.startsWith("avatar-") && file.endsWith(".webp"),
  );

  if (files.length !== collection.expectedAvatarCount) {
    failures.push(
      `${collection.key}: ${files.length} avatares, esperado ${collection.expectedAvatarCount}.`,
    );
  }

  for (const file of files) {
    const filePath = path.join(directory, file);
    const image = sharp(filePath);
    const [metadata, stats] = await Promise.all([
      image.metadata(),
      image.stats(),
    ]);
    const alpha = stats.channels[3];

    if (metadata.width !== 1024 || metadata.height !== 1024) {
      failures.push(
        `${collection.key}/${file}: ${metadata.width}x${metadata.height}, esperado 1024x1024.`,
      );
    }
    if (!metadata.hasAlpha || !alpha || alpha.min !== 0 || alpha.max !== 255) {
      failures.push(
        `${collection.key}/${file}: precisa combinar transparência real e pixels opacos.`,
      );
    }
    avatarCount += 1;
  }
}

if (failures.length > 0) {
  console.error("Auditoria visual dos avatares falhou:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Assets cosméticos válidos: ${avatarCount} avatares WebP transparentes.`,
);
