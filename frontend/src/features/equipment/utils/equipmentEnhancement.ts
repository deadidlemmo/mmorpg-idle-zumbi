export interface EquipmentEnhancementSource {
  enhancementLevel?: number | string | null;
  name?: string | null;
}

export type EquipmentEnhancementLevel = 0 | 1 | 2 | 3;

const MAX_EQUIPMENT_ENHANCEMENT_LEVEL = 3;

export function getEquipmentEnhancementLevel(
  item?: EquipmentEnhancementSource | null,
): EquipmentEnhancementLevel {
  if (!item) return 0;

  if (item.enhancementLevel !== null && item.enhancementLevel !== undefined) {
    const explicitLevel = Number(item.enhancementLevel);

    if (Number.isFinite(explicitLevel)) {
      return Math.min(
        MAX_EQUIPMENT_ENHANCEMENT_LEVEL,
        Math.max(0, Math.floor(explicitLevel)),
      ) as EquipmentEnhancementLevel;
    }
  }

  const nameMatch = item.name?.trim().match(/\+([1-3])$/);

  return nameMatch ? (Number(nameMatch[1]) as EquipmentEnhancementLevel) : 0;
}

export function getEquipmentBaseDisplayName(
  item?: EquipmentEnhancementSource | null,
  fallback = "Item desconhecido",
) {
  const name = item?.name?.trim();

  if (!name) return fallback;

  return name.replace(/\s+\+[1-3]$/, "");
}
