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
  isSelected?: boolean;
  onSelect?: () => void;
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
  head: 'E',
  'main-hand': 'MP',
  'off-hand': 'MS',
  armor: 'A',
  pants: 'C',
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
  isSelected = false,
  onSelect,
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
  const rarityLabel = hasItem ? rarityMeta.label : 'Sem item';

  const content = (
    <>
      <div className="equipment-summary-slot__slot" aria-hidden="true">
        <div className="equipment-summary-slot__icon">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" />
          ) : (
            <span>{SLOT_INITIALS[normalizedSlotKey]}</span>
          )}
        </div>
      </div>

      <div className="equipment-summary-slot__content">
        <span className="equipment-summary-slot__label">{slotLabel}</span>
        <strong className="equipment-summary-slot__name">{itemName}</strong>
      </div>

      <span className="equipment-summary-slot__meta">
        {hasItem ? `${tierLabel} · ${rarityLabel}` : rarityLabel}
      </span>
    </>
  );

  const className = [
    'equipment-summary-slot',
    `equipment-summary-slot--${normalizedSlotKey}`,
    `equipment-summary-slot--rarity-${rarityMeta.key}`,
    rarityMeta.cssClass,
    hasItem ? 'has-item' : 'is-empty',
    hasImage
      ? 'equipment-summary-slot--with-image'
      : 'equipment-summary-slot--fallback',
    isSelected ? 'is-selected' : '',
    onSelect ? 'is-interactive' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        title={`${slotLabel}: ${itemName}`}
        aria-label={`${slotLabel}: ${itemName}`}
        aria-pressed={isSelected}
        onClick={onSelect}
      >
        {content}
      </button>
    );
  }

  return (
    <article
      className={className}
      style={style}
      title={`${slotLabel}: ${itemName}`}
      aria-label={`${slotLabel}: ${itemName}`}
    >
      {content}
    </article>
  );
}
