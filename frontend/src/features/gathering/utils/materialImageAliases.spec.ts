import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MATERIAL_IMAGE_SLUG_ALIASES,
  resolveMaterialImageSlug,
} from './materialImageAliases';

const MATERIAL_ASSET_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../assets/images/items/materials',
);

async function listMaterialAssetSlugs(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedSlugs = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listMaterialAssetSlugs(entryPath);
      }

      return /\.(png|jpe?g|webp)$/i.test(entry.name)
        ? [entry.name.replace(/\.(png|jpe?g|webp)$/i, '')]
        : [];
    }),
  );

  return nestedSlugs.flat();
}

test('material aliases point only to existing canonical assets', async () => {
  const aliases = Object.entries(MATERIAL_IMAGE_SLUG_ALIASES);
  const availableSlugs = new Set(
    await listMaterialAssetSlugs(MATERIAL_ASSET_ROOT),
  );

  assert.equal(aliases.length, 29);

  for (const [legacySlug, canonicalSlug] of aliases) {
    assert.notEqual(legacySlug, canonicalSlug);
    assert.equal(resolveMaterialImageSlug(legacySlug), canonicalSlug);
    assert.equal(
      availableSlugs.has(canonicalSlug),
      true,
      `Missing canonical image for ${legacySlug}: ${canonicalSlug}`,
    );
    assert.equal(
      Object.hasOwn(MATERIAL_IMAGE_SLUG_ALIASES, canonicalSlug),
      false,
      `Alias chain is not allowed: ${legacySlug} -> ${canonicalSlug}`,
    );
  }
});

test('canonical material slugs remain unchanged', () => {
  assert.equal(resolveMaterialImageSlug('fragmento-de-ameaca-t3'), 'fragmento-de-ameaca-t3');
  assert.equal(resolveMaterialImageSlug('fragmento-de-reforco-t5'), 'fragmento-de-reforco-t5');
  assert.equal(resolveMaterialImageSlug('nucleo-infectado-de-elite-raro'), 'nucleo-infectado-de-elite-raro');
});
