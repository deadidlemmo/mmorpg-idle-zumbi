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
  tierRangeLabel: string;
}

interface EquipmentRaritySource {
  rarity?: string | null;
  tier?: number | null;
}

/**
 * Regra visual oficial por tier:
 *
 * T0, T1, T2 => Comum / Branco
 * T3, T4     => Incomum / Amarelo
 * T5, T6     => Raro / Verde
 * T7, T8     => Épico / Roxo
 * T9, T10+   => Lendário / Vermelho
 *
 * Regra importante:
 * A tier tem prioridade visual.
 * O rarity vindo do backend fica apenas como fallback caso o item venha sem tier.
 */
export function normalizeEquipmentRarity(
  rarity?: string | null,
  tier?: number | null,
): EquipmentVisualRarity {
  const safeTier = Number(tier);

  if (Number.isFinite(safeTier)) {
    if (safeTier >= 9) return 'legendary';
    if (safeTier >= 7) return 'epic';
    if (safeTier >= 5) return 'rare';
    if (safeTier >= 3) return 'uncommon';

    return 'common';
  }

  const normalizedRarity = rarity?.trim().toUpperCase();

  if (normalizedRarity === 'COMMON') return 'common';
  if (normalizedRarity === 'UNCOMMON') return 'uncommon';
  if (normalizedRarity === 'RARE') return 'rare';
  if (normalizedRarity === 'EPIC') return 'epic';
  if (normalizedRarity === 'LEGENDARY') return 'legendary';

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

export function getEquipmentRarityTierRangeLabel(
  rarity: EquipmentVisualRarity,
) {
  const labels: Record<EquipmentVisualRarity, string> = {
    common: 'T0-T2',
    uncommon: 'T3-T4',
    rare: 'T5-T6',
    epic: 'T7-T8',
    legendary: 'T9-T10+',
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
    tierRangeLabel: getEquipmentRarityTierRangeLabel(rarity),
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

export function getEquipmentRarityCssVariables(
  item?: EquipmentRaritySource | null,
): Record<string, string> {
  const rarity = getEquipmentRarityFromItem(item);

  return {
    '--equipment-rarity-rgb': rarity.rgb,
    '--equipment-rarity-hex': rarity.hex,
  };
}

export function formatEquipmentRarityLabel(
  item?: EquipmentRaritySource | null,
) {
  const rarity = getEquipmentRarityFromItem(item);

  return `${rarity.label} · ${rarity.tierRangeLabel}`;
}