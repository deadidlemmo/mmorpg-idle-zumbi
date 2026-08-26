import type {
  EquipmentReinforcementItem,
  EquipmentReinforcementSlotState,
  EquipmentReinforcementState,
} from "../../inventory/api/inventory.api";

export const REINFORCEMENT_STAT_CONFIGS = [
  { key: "strengthBonus", label: "Força", short: "FOR" },
  { key: "vitalityBonus", label: "Vitalidade", short: "VIT" },
  { key: "agilityBonus", label: "Agilidade", short: "AGI" },
  { key: "precisionBonus", label: "Precisão", short: "PRE" },
  { key: "techniqueBonus", label: "Técnica", short: "TEC" },
  { key: "willpowerBonus", label: "Vontade", short: "VON" },
] as const;

const SLOT_ORDER = [
  "MAIN_HAND",
  "OFF_HAND",
  "HEAD",
  "ARMOR",
  "PANTS",
  "BOOTS",
] as const;

export interface ReinforcementStatChange {
  key: (typeof REINFORCEMENT_STAT_CONFIGS)[number]["key"];
  label: string;
  short: string;
  current: number;
  next: number;
  delta: number;
}

export interface ReinforcementProgress {
  current: number;
  required: number;
  remaining: number;
  percent: number;
}

export function getReinforcementStatChanges(
  currentItem?: EquipmentReinforcementItem | null,
  nextItem?: EquipmentReinforcementItem | null,
): ReinforcementStatChange[] {
  if (!currentItem || !nextItem) return [];

  return REINFORCEMENT_STAT_CONFIGS.map((stat) => {
    const current = Number(currentItem[stat.key] ?? 0);
    const next = Number(nextItem[stat.key] ?? 0);

    return {
      ...stat,
      current,
      next,
      delta: next - current,
    };
  }).filter((stat) => stat.delta !== 0);
}

export function selectReinforcementOpportunity(
  state?: EquipmentReinforcementState | null,
  tier?: number | null,
): EquipmentReinforcementSlotState | null {
  if (!state) return null;

  const normalizedTier = Number(tier);
  const hasTier = Number.isFinite(normalizedTier) && normalizedTier > 0;
  const candidates = state.slots.filter(
    (slot) =>
      slot.item &&
      slot.cost &&
      (!hasTier || slot.item.tier === Math.floor(normalizedTier)),
  );

  candidates.sort((left, right) => {
    const leftLevel = Number(left.item?.enhancementLevel ?? 0);
    const rightLevel = Number(right.item?.enhancementLevel ?? 0);
    const levelDifference = leftLevel - rightLevel;

    if (levelDifference !== 0) return levelDifference;

    return (
      SLOT_ORDER.indexOf(left.slot as (typeof SLOT_ORDER)[number]) -
      SLOT_ORDER.indexOf(right.slot as (typeof SLOT_ORDER)[number])
    );
  });

  return candidates[0] ?? null;
}

export function getReinforcementProgress(
  slot?: EquipmentReinforcementSlotState | null,
): ReinforcementProgress | null {
  if (!slot?.cost) return null;

  const current = Math.max(0, Math.floor(slot.cost.materialBalance));
  const required = Math.max(1, Math.floor(slot.cost.fragmentCost));

  return {
    current,
    required,
    remaining: Math.max(0, required - current),
    percent: Math.min(100, Math.round((current / required) * 100)),
  };
}
