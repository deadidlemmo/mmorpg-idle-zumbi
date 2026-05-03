export type EquipmentVisualRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type EquipmentRarityKey = EquipmentVisualRarity;

export interface EquipmentRarityMeta {
  key: EquipmentRarityKey;
  label: string;
  rgb: string;
  hex: string;
  cssClass: string;
}

interface EquipmentRaritySource {
  rarity?: string | null;
  tier?: number | null;
}

/**
 * Regra visual atual:
 * T0, T1, T2 => Comum / Branco
 * T3, T4     => Incomum / Amarelo
 * T5, T6     => Raro / Verde
 * T7, T8     => Épico / Roxo
 * T9, T10+   => Lendário / Vermelho
 *
 * Se o backend mandar rarity válida, ela tem prioridade.
 * Se não mandar, o front calcula pela tier.
 */
export function normalizeEquipmentRarity(
  rarity?: string | null,
  tier?: number | null,
): EquipmentVisualRarity {
  const normalizedRarity = rarity?.trim().toUpperCase();

  if (normalizedRarity === 'COMMON') return 'common';
  if (normalizedRarity === 'UNCOMMON') return 'uncommon';
  if (normalizedRarity === 'RARE') return 'rare';
  if (normalizedRarity === 'EPIC') return 'epic';
  if (normalizedRarity === 'LEGENDARY') return 'legendary';

  const safeTier = Number(tier);

  if (!Number.isFinite(safeTier)) return 'common';

  if (safeTier >= 9) return 'legendary';
  if (safeTier >= 7) return 'epic';
  if (safeTier >= 5) return 'rare';
  if (safeTier >= 3) return 'uncommon';

  return 'common';
}

export function getEquipmentRarityLabel(rarity: EquipmentVisualRarity) {
  const labels: Record<EquipmentVisualRarity, string> = {
    common: 'Comum',
    uncommon: 'Incomum',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Lendário',
  };

  return labels[rarity];
}

export function getEquipmentRarityColor(rarity: EquipmentVisualRarity) {
  const colors: Record<EquipmentVisualRarity, { rgb: string; hex: string }> = {
    common: {
      rgb: '231, 227, 216',
      hex: '#e7e3d8',
    },
    uncommon: {
      rgb: '224, 182, 91',
      hex: '#e0b65b',
    },
    rare: {
      rgb: '101, 194, 113',
      hex: '#65c271',
    },
    epic: {
      rgb: '167, 111, 224',
      hex: '#a76fe0',
    },
    legendary: {
      rgb: '218, 83, 73',
      hex: '#da5349',
    },
  };

  return colors[rarity];
}

export function getEquipmentRarityMeta(
  rarity: EquipmentVisualRarity,
): EquipmentRarityMeta {
  const color = getEquipmentRarityColor(rarity);

  return {
    key: rarity,
    label: getEquipmentRarityLabel(rarity),
    rgb: color.rgb,
    hex: color.hex,
    cssClass: `equipment-rarity-${rarity}`,
  };
}

export function getEquipmentRarityFromItem(
  item?: EquipmentRaritySource | null,
): EquipmentRarityMeta {
  const rarity = normalizeEquipmentRarity(item?.rarity, item?.tier);

  return getEquipmentRarityMeta(rarity);
}

export function getEquipmentRarityClassName(
  item?: EquipmentRaritySource | null,
) {
  return getEquipmentRarityFromItem(item).cssClass;
}