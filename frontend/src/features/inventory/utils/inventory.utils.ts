import type {
  InventoryEntry,
  InventoryFilterKey,
  InventoryFilterOption,
  InventoryItemDetails,
} from '../types/inventory.types';

const FILTER_ORDER: Array<Omit<InventoryFilterOption, 'count'>> = [
  { key: 'ALL', label: 'Todos' },
  { key: 'MATERIAL', label: 'Materiais' },
  { key: 'EQUIPMENT', label: 'Equipamentos' },
  { key: 'CONSUMABLE', label: 'Consumíveis' },
  { key: 'RESOURCE', label: 'Recursos' },
  { key: 'OTHER', label: 'Outros' },
];

const MATERIAL_ORIGIN_LABELS: Record<string, string> = {
  DESMANCHE: 'Desmanche',
  COLETA: 'Coleta',
  CONTENCAO: 'Contenção',
  CONTENÇÃO: 'Contenção',
  ARSENAL: 'Arsenal',
  PATRULHA: 'Patrulha',
  TECNOVARREDURA: 'Tecnovarredura',
  DROP_MOBS: 'Drop de monstros',
};

const SLOT_LABELS: Record<string, string> = {
  MAIN_HAND: 'Mão principal',
  OFF_HAND: 'Mão secundária',
  HEAD: 'Cabeça',
  ARMOR: 'Armadura',
  PANTS: 'Calças',
  BOOTS: 'Botas',
  MATERIAL: 'Material',
  CONSUMABLE: 'Consumível',
};

const RARITY_LABELS: Record<string, string> = {
  COMMON: 'Comum',
  UNCOMMON: 'Incomum',
  RARE: 'Raro',
  EPIC: 'Épico',
  LEGENDARY: 'Lendário',
};

export function getInventoryItemCategory(entry: InventoryEntry): InventoryFilterKey {
  const type = entry.type?.toUpperCase?.() ?? '';
  const slot = entry.item?.slot?.toUpperCase?.() ?? '';
  const family = entry.item?.family?.toLowerCase?.() ?? '';

  if (type === 'EQUIPMENT') return 'EQUIPMENT';
  if (type === 'CONSUMABLE' || slot === 'CONSUMABLE') return 'CONSUMABLE';
  if (type === 'MATERIAL' || slot === 'MATERIAL') return 'MATERIAL';
  if (family.includes('resource') || family.includes('recurso')) return 'RESOURCE';

  return 'OTHER';
}

export function buildInventoryFilters(items: InventoryEntry[]): InventoryFilterOption[] {
  return FILTER_ORDER.map((filter) => ({
    ...filter,
    count:
      filter.key === 'ALL'
        ? items.length
        : items.filter((item) => getInventoryItemCategory(item) === filter.key)
            .length,
  }));
}

export function filterInventoryItems(
  items: InventoryEntry[],
  activeFilter: InventoryFilterKey,
) {
  if (activeFilter === 'ALL') {
    return items;
  }

  return items.filter((item) => getInventoryItemCategory(item) === activeFilter);
}

export function formatInventoryType(entry: InventoryEntry) {
  const category = getInventoryItemCategory(entry);

  const labels: Record<InventoryFilterKey, string> = {
    ALL: 'Item',
    MATERIAL: 'Material',
    EQUIPMENT: 'Equipamento',
    CONSUMABLE: 'Consumível',
    RESOURCE: 'Recurso',
    OTHER: 'Outro',
  };

  return labels[category];
}

export function formatInventoryRarity(rarity?: string | null) {
  if (!rarity) return 'Sem raridade';

  return RARITY_LABELS[rarity] ?? rarity;
}

export function formatInventorySlot(slot?: string | null) {
  if (!slot) return null;

  return SLOT_LABELS[slot] ?? slot;
}

export function formatMaterialOrigin(origin?: string | null) {
  if (!origin) return null;

  return MATERIAL_ORIGIN_LABELS[origin] ?? origin;
}

export function getInventoryItemInitials(item?: InventoryItemDetails | null) {
  const name = item?.name?.trim();

  if (!name) return '?';

  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function getInventoryItemIcon(entry: InventoryEntry) {
  const category = getInventoryItemCategory(entry);

  if (category === 'EQUIPMENT') return '◇';
  if (category === 'CONSUMABLE') return '+';
  if (category === 'MATERIAL') return '▥';
  if (category === 'RESOURCE') return '◈';

  return '▦';
}

export function getInventoryPrimaryDetail(entry: InventoryEntry) {
  const origin = formatMaterialOrigin(entry.item?.materialOrigin);
  const slot = formatInventorySlot(entry.item?.slot);

  return origin ?? slot ?? entry.item?.family ?? null;
}

export function getInventoryBonusList(item: InventoryItemDetails) {
  return [
    ['FOR', item.strengthBonus],
    ['VIT', item.vitalityBonus],
    ['AGI', item.agilityBonus],
    ['PRE', item.precisionBonus],
    ['TEC', item.techniqueBonus],
    ['VON', item.willpowerBonus],
  ].filter(([, value]) => Number(value) > 0) as Array<[string, number]>;
}
