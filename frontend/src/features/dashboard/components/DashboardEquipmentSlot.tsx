import type { CSSProperties } from 'react';
import { getEquipmentRarityFromItem } from '../constants/equipment-rarity';
import type { DashboardEquipmentItem } from '../types/dashboard.types';

type EquipmentSlotKey =
  | 'head'
  | 'main-hand'
  | 'off-hand'
  | 'armor'
  | 'pants'
  | 'boots';

interface DashboardEquipmentSlotProps {
  label: string;
  item?: DashboardEquipmentItem | null;
  slotKey?: EquipmentSlotKey;
}

type EquipmentItemWithIcon = DashboardEquipmentItem & {
  iconUrl?: string | null;
  imageUrl?: string | null;
  image?: string | null;
};

const SLOT_LABELS: Record<EquipmentSlotKey, string> = {
  head: 'Elmo',
  'main-hand': 'Mão principal',
  'off-hand': 'Mão secundária',
  armor: 'Armadura',
  pants: 'Calça',
  boots: 'Botas',
};

const SLOT_INITIALS: Record<EquipmentSlotKey, string> = {
  head: 'H',
  'main-hand': 'M',
  'off-hand': 'O',
  armor: 'A',
  pants: 'P',
  boots: 'B',
};

function normalizeSlotKey(label: string, slotKey?: EquipmentSlotKey) {
  if (slotKey) return slotKey;

  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');

  const map: Record<string, EquipmentSlotKey> = {
    elmo: 'head',
    cabeca: 'head',
    head: 'head',
    helmet: 'head',

    'main-hand': 'main-hand',
    mainhand: 'main-hand',
    arma: 'main-hand',
    'arma-principal': 'main-hand',
    armaprincipal: 'main-hand',

    'off-hand': 'off-hand',
    offhand: 'off-hand',
    escudo: 'off-hand',
    secundario: 'off-hand',
    secundaria: 'off-hand',

    armadura: 'armor',
    armor: 'armor',
    camisa: 'armor',
    chest: 'armor',
    torso: 'armor',

    calca: 'pants',
    pants: 'pants',
    pernas: 'pants',

    botas: 'boots',
    bota: 'boots',
    calcado: 'boots',
    boots: 'boots',
    pes: 'boots',
    feet: 'boots',
  };

  return map[normalized] ?? 'armor';
}

function formatTier(tier?: number | null) {
  if (tier === null || tier === undefined) return 'T?';

  return `T${tier}`;
}

function getItemImage(item?: EquipmentItemWithIcon | null) {
  if (!item) return null;

  return item.iconUrl ?? item.imageUrl ?? item.image ?? null;
}

export function DashboardEquipmentSlot({
  label,
  item,
  slotKey,
}: DashboardEquipmentSlotProps) {
  const normalizedSlotKey = normalizeSlotKey(label, slotKey);
  const rarityMeta = getEquipmentRarityFromItem(item);
  const tierLabel = formatTier(item?.tier);
  const imageUrl = getItemImage(item as EquipmentItemWithIcon | null);
  const hasItem = Boolean(item);
  const hasImage = Boolean(imageUrl);

  const style = {
    '--equipment-rgb': rarityMeta.rgb,
  } as CSSProperties;

  const itemName = item?.name ?? 'Vazio';
  const slotLabel = SLOT_LABELS[normalizedSlotKey];

  return (
    <article
      className={[
        'equipment-node',
        `equipment-node--${normalizedSlotKey}`,
        `equipment-node--rarity-${rarityMeta.key}`,
        rarityMeta.cssClass,
        hasItem ? 'has-item' : 'is-empty',
        hasImage ? 'equipment-node--with-image' : 'equipment-node--fallback',
      ].join(' ')}
      style={style}
      title={`${slotLabel}: ${itemName}`}
      aria-label={`${slotLabel}: ${itemName}`}
    >
      <div className="equipment-node__slot" aria-hidden="true">
        <span className="equipment-node__tier">{tierLabel}</span>

        <div className="equipment-node__icon">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <span>{SLOT_INITIALS[normalizedSlotKey]}</span>
          )}
        </div>
      </div>

      <strong className="equipment-node__name">{itemName}</strong>

      <span className="equipment-node__label">{slotLabel}</span>
    </article>
  );
}