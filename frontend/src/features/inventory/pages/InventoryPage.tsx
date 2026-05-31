import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import goldIcon from '../../../assets/images/coins/gold.png';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import { DashboardEquipmentBody } from '../../dashboard/components/DashboardEquipmentBody';
import '../../dashboard/dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
  DashboardEquipmentItem,
  DashboardEquipmentViewModel,
} from '../../dashboard/types/dashboard.types';
import { EmptyInventoryState } from '../components/EmptyInventoryState';
import { InventoryFilters } from '../components/InventoryFilters';
import { InventoryGrid } from '../components/InventoryGrid';
import { InventoryItemDetailsModal } from '../components/InventoryItemDetailsModal';
import {
  getCharacterBank,
  getCharacterEquipment,
  equipInventoryItem,
  extractInventoryActionApiError,
  consumeInventoryItem,
  depositInventoryItemToBank,
  sellInventoryItemToBlackMarket,
  unequipInventoryItem,
  withdrawInventoryItemFromBank,
} from '../api/inventory.api';
import { useInventory } from '../hooks/useInventory';
import '../styles/inventory.css';
import type {
  InventoryEntry,
  InventoryFilterKey,
  InventoryItemActionFeedback,
  InventoryItemActionViewModel,
} from '../types/inventory.types';
import {
  buildInventoryFilters,
  filterInventoryItems,
  formatInventoryRarity,
  formatInventoryType,
  formatMaterialOrigin,
  getInventoryBonusList,
  getInventoryItemIcon,
  getInventoryItemInitials,
  getInventoryPrimaryDetail,
} from '../utils/inventory.utils';

type InventoryTabKey = 'inventory' | 'equipped' | 'bank';

const INVENTORY_TABS: Array<{
  key: InventoryTabKey;
  label: string;
  description: string;
}> = [
  {
    key: 'inventory',
    label: 'Inventário',
    description: 'Itens guardados na mochila',
  },
  {
    key: 'equipped',
    label: 'Equipados',
    description: 'Conjunto ativo do personagem',
  },
  {
    key: 'bank',
    label: 'Banco',
    description: 'Armazenamento seguro',
  },
];

function useIsMobileInventoryDetails() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 760px)');

    function updateIsMobile() {
      setIsMobile(mediaQuery.matches);
    }

    updateIsMobile();
    mediaQuery.addEventListener('change', updateIsMobile);

    return () => {
      mediaQuery.removeEventListener('change', updateIsMobile);
    };
  }, []);

  return isMobile;
}

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;

  const className =
    character.class?.name ?? character.gameClass?.name ?? 'Lutador';

  const currentMapName =
    character.currentMap?.name ??
    character.map?.name ??
    overview.progression?.currentMap?.name ??
    'Sem mapa';

  return {
    ...character,

    id: character.id,
    name: character.name,

    className,
    classId: character.classId ?? normalizeClassName(className),

    level: character.level ?? 1,

    xp: character.xp ?? 0,
    totalXp:
      character.totalXp ??
      character.levelProgress?.totalXp ??
      character.xp ??
      0,

    currentLevelXp:
      character.currentLevelXp ??
      character.xpIntoCurrentLevel ??
      character.levelProgress?.currentLevelXp ??
      character.levelProgress?.xpIntoCurrentLevel ??
      null,

    xpToNextLevel:
      character.xpToNextLevel ??
      character.nextLevelXp ??
      character.levelProgress?.xpToNextLevel ??
      character.levelProgress?.nextLevelXp ??
      null,

    nextLevelXp:
      character.nextLevelXp ??
      character.xpToNextLevel ??
      character.levelProgress?.nextLevelXp ??
      character.levelProgress?.xpToNextLevel ??
      null,

    xpProgressPercent:
      character.xpProgressPercent ??
      character.levelProgress?.xpProgressPercent ??
      character.levelProgress?.progressPercent ??
      null,

    xpIntoCurrentLevel:
      character.xpIntoCurrentLevel ??
      character.currentLevelXp ??
      character.levelProgress?.xpIntoCurrentLevel ??
      character.levelProgress?.currentLevelXp ??
      null,

    xpNeededForNextLevel:
      character.xpNeededForNextLevel ??
      character.levelProgress?.xpNeededForNextLevel ??
      null,

    currentLevelStartXp:
      character.currentLevelStartXp ??
      character.levelProgress?.currentLevelStartXp ??
      null,

    nextLevelRequiredXp:
      character.nextLevelRequiredXp ??
      character.levelProgress?.nextLevelRequiredXp ??
      null,

    isAtLevelCap:
      character.isAtLevelCap ?? character.levelProgress?.isAtLevelCap ?? false,

    levelProgress: character.levelProgress ?? null,

    status: character.status ?? 'ACTIVE',

    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,

    avatarKey: character.avatarKey ?? null,
    avatarUrl: character.avatarUrl ?? null,

    currentMapName,

    class: character.class ?? null,
    gameClass: character.gameClass ?? null,

    map: character.map ?? null,
    currentMap:
      character.currentMap ?? overview.progression?.currentMap ?? null,

    equipment: character.equipment ?? overview.equipment ?? {},
    inventory: character.inventory ?? [],

    potionConfig: character.potionConfig ?? character.autoPotionConfig ?? null,
    potionConfigs: character.potionConfigs ?? [],
    autoPotionConfig: character.autoPotionConfig ?? null,

    inventorySummary: character.inventorySummary,
    gatheringSkills: character.gatheringSkills,
    autoCombatSession: character.autoCombatSession ?? null,

    deletedAt: character.deletedAt ?? null,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

type InventoryEntryLoose = InventoryEntry & {
  id?: string | null;
  inventoryItemId?: string | null;
  item?: InventoryEntry['item'] & {
    id?: string | null;
  };
};

type InventorySelectionSource = 'inventory' | 'equipped' | 'bank';

interface InventorySelectionState {
  source: InventorySelectionSource;
  entry: InventoryEntry | null;
  emptySlotLabel?: string | null;
}

const EMPTY_PANEL_TEXT = 'Clique em um slot para visualizar os detalhes.';

function isEquipmentEntry(entry: InventoryEntry) {
  const entryType = String(entry.type ?? '').toUpperCase();
  const slot = String(entry.item.slot ?? '').toUpperCase();

  return (
    entryType === 'EQUIPMENT' && slot !== 'MATERIAL' && slot !== 'CONSUMABLE'
  );
}

function isConsumableEntry(entry: InventoryEntry) {
  const entryType = String(entry.type ?? '').toUpperCase();
  const slot = String(entry.item.slot ?? '').toUpperCase();

  return entryType === 'CONSUMABLE' || slot === 'CONSUMABLE';
}

function isBlackMarketStackableEntry(entry: InventoryEntry) {
  const entryType = String(entry.type ?? '').toUpperCase();
  const slot = String(entry.item.slot ?? '').toUpperCase();

  return (
    entryType !== 'EQUIPMENT' && (slot === 'MATERIAL' || slot === 'CONSUMABLE')
  );
}

function getBlackMarketUnitValue(entry: InventoryEntry) {
  const backendValue = Number(entry.blackMarketSellPrice);

  if (Number.isFinite(backendValue) && backendValue > 0) {
    return Math.floor(backendValue);
  }

  const tier = Math.min(10, Math.max(1, Math.floor(Number(entry.item.tier) || 1)));
  const baseValueByTier: Record<number, number> = {
    1: 3,
    2: 6,
    3: 12,
    4: 20,
    5: 32,
    6: 50,
    7: 76,
    8: 112,
    9: 160,
    10: 225,
  };
  const rarityMultiplierByKey: Record<string, number> = {
    COMMON: 1,
    UNCOMMON: 1.35,
    RARE: 1.85,
    EPIC: 2.6,
    LEGENDARY: 3.75,
  };
  const typeMultiplier = isEquipmentEntry(entry)
    ? 8
    : isConsumableEntry(entry)
      ? 2
      : 1;
  const rarityMultiplier =
    rarityMultiplierByKey[String(entry.item.rarity ?? 'COMMON').toUpperCase()] ??
    1;

  return Math.max(
    1,
    Math.floor((baseValueByTier[tier] ?? 3) * typeMultiplier * rarityMultiplier),
  );
}

function clampSaleQuantity(entry: InventoryEntry, quantity: number) {
  const maxQuantity = isBlackMarketStackableEntry(entry)
    ? Math.max(0, Math.floor(Number(entry.quantity) || 0))
    : 1;

  if (maxQuantity <= 0) return 1;

  return Math.max(1, Math.min(maxQuantity, Math.floor(quantity) || 1));
}

function getInventoryItemActions(
  entry: InventoryEntry | null,
  source: InventorySelectionSource,
): InventoryItemActionViewModel[] {
  if (!entry || entry.quantity <= 0) return [];

  if (source === 'equipped' && isEquipmentEntry(entry)) {
    return [
      {
        kind: 'unequip',
        label: 'Desequipar',
        description: 'Remove este item do slot atual do personagem.',
      },
    ];
  }

  if (source === 'bank') {
    return [
      {
        kind: 'withdraw',
        label: 'Retirar',
        description: 'Move este item do banco para a mochila.',
      },
    ];
  }

  if (source !== 'inventory') return [];

  const actions: InventoryItemActionViewModel[] = [];

  if (isConsumableEntry(entry)) {
    actions.push({
      kind: 'consume',
      label: 'Usar',
      description: 'Consome 1 unidade e aplica o efeito do item.',
    });
  }

  if (isEquipmentEntry(entry)) {
    actions.push({
      kind: 'equip',
      label: 'Equipar',
      description: 'Move este item para o slot compat\u00edvel do personagem.',
    });
  }

  actions.push({
    kind: 'deposit',
    label: 'Enviar ao banco',
    description: '',
  });

  if (entry.item.isSellable !== false) {
    actions.push({
      kind: 'blackMarket',
      label: 'Vender',
      description: 'Converte este item em Gold sem passar pelo Mercador.',
    });
  }

  return actions;
}

function findEquipmentItemById(
  equipment: DashboardEquipmentViewModel,
  itemId: string | null,
) {
  if (!itemId) return null;

  return (
    [
      equipment.mainHand,
      equipment.offHand,
      equipment.head,
      equipment.armor,
      equipment.pants,
      equipment.boots,
    ].find((item) => item?.id === itemId) ?? null
  );
}

function buildEquippedInventoryEntry(
  item: DashboardEquipmentItem,
): InventoryEntry {
  return {
    inventoryItemId: `equipped-${item.id}`,
    quantity: 1,
    type: 'EQUIPMENT',
    item: {
      id: item.id,
      name: item.name,
      description: item.description,
      tier: item.tier,
      rarity: item.rarity,
      slot: item.slot,
      family: item.family,
      materialOrigin: item.materialOrigin,
      strengthBonus: item.strengthBonus,
      vitalityBonus: item.vitalityBonus,
      agilityBonus: item.agilityBonus,
      precisionBonus: item.precisionBonus,
      techniqueBonus: item.techniqueBonus,
      willpowerBonus: item.willpowerBonus,
      healFlat: item.healFlat,
      healPercent: item.healPercent,
      usableInCombat: item.usableInCombat,
      usableOutOfCombat: item.usableOutOfCombat,
      minTier: item.minTier,
      maxTier: item.maxTier,
      isCraftable: item.isCraftable,
    },
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function getInventoryEntryId(entry?: InventoryEntry | null) {
  if (!entry) return null;

  const looseEntry = entry as InventoryEntryLoose;

  return (
    looseEntry.inventoryItemId ?? looseEntry.id ?? looseEntry.item?.id ?? null
  );
}

function normalizeRarityClass(rarity?: string | null) {
  return String(rarity ?? 'COMMON')
    .trim()
    .toLowerCase();
}

function hasPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatQuantity(quantity?: number | null) {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));

  return safeQuantity.toLocaleString('pt-BR');
}

function buildDetails(entry: InventoryEntry): Array<[string, string]> {
  const item = entry.item;

  const details: Array<[string, string | null]> = [
    ['Quantidade', formatQuantity(entry.quantity)],
    ['Tipo', formatInventoryType(entry)],
    ['Raridade', formatInventoryRarity(item.rarity)],
    ['Tier', typeof item.tier === 'number' ? String(item.tier) : null],
    ['Origem', formatMaterialOrigin(item.materialOrigin)],
    ['Classe', item.class?.name ?? null],
  ];

  return details.filter((detail): detail is [string, string] =>
    Boolean(detail[1]),
  );
}

interface InventoryDesktopDetailsPanelProps {
  entry: InventoryEntry | null;
  onClear: () => void;
  emptyText: string;
  emptySlotLabel?: string | null;
  actions?: InventoryItemActionViewModel[];
  actionFeedback?: InventoryItemActionFeedback | null;
  isActionBusy?: boolean;
  onUseItem?: (entry: InventoryEntry, action: InventoryItemActionViewModel) => void;
}

function InventoryDesktopDetailsPanel({
  entry,
  onClear,
  emptyText,
  emptySlotLabel = null,
  actions = [],
  actionFeedback = null,
  isActionBusy = false,
  onUseItem,
}: InventoryDesktopDetailsPanelProps) {
  if (!entry) {
    return (
      <aside
        className="inventory-details-panel inventory-details-panel--empty"
        aria-label="Detalhes do item"
      >
        <div className="inventory-details-panel__empty-icon">▦</div>

        <strong>{emptySlotLabel ? 'Slot vazio' : 'Selecione um item'}</strong>

        <p>
          {emptySlotLabel
            ? `${emptySlotLabel} está vazio. Escolha outro slot para visualizar os detalhes de um item.`
            : emptyText}
        </p>
      </aside>
    );
  }

  const item = entry.item;
  const itemName = item.name?.trim() || 'Item desconhecido';
  const description = item.description?.trim();

  const bonuses = getInventoryBonusList(item);
  const rarity = item.rarity ?? 'COMMON';
  const rarityLabel = formatInventoryRarity(item.rarity);
  const typeLabel = formatInventoryType(entry);
  const primaryDetail = getInventoryPrimaryDetail(entry);
  const details = buildDetails(entry);

  const hasStats =
    bonuses.length > 0 ||
    hasPositiveNumber(item.healFlat) ||
    hasPositiveNumber(item.healPercent);

  return (
    <aside
      className={`inventory-details-panel rarity-${normalizeRarityClass(rarity)}`}
      aria-label={`Detalhes de ${itemName}`}
    >
      <button
        type="button"
        className="inventory-details-panel__close"
        onClick={onClear}
        aria-label="Limpar seleção do item"
      >
        ×
      </button>

      <div className="inventory-details-panel__header">
        <div
          className="inventory-item-card__icon inventory-details-panel__icon"
          aria-hidden="true"
        >
          <span className="inventory-item-card__glyph">
            {getInventoryItemIcon(entry)}
          </span>

          <strong>{getInventoryItemInitials(item)}</strong>
        </div>

        <span className="inventory-details-panel__eyebrow">
          {primaryDetail ?? typeLabel}
        </span>

        <h2>{itemName}</h2>

        <div className="inventory-details-panel__badges">
          <span>{rarityLabel}</span>
          <span>{typeLabel}</span>
          <span>x{formatQuantity(entry.quantity)}</span>

          {typeof item.tier === 'number' ? <span>Tier {item.tier}</span> : null}
        </div>
      </div>

      <div className="inventory-details-panel__section">
        <h3>Descrição</h3>

        <p>{description || 'Sem descrição registrada para este item.'}</p>
      </div>

      {hasStats ? (
        <div className="inventory-details-panel__section">
          <h3>Atributos principais</h3>

          <div className="inventory-details-panel__stats">
            {bonuses.map(([label, value]) => (
              <span key={label}>
                +{value} {label}
              </span>
            ))}

            {hasPositiveNumber(item.healFlat) ? (
              <span>+{item.healFlat} HP</span>
            ) : null}

            {hasPositiveNumber(item.healPercent) ? (
              <span>{item.healPercent}% HP</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="inventory-details-panel__section">
        <h3>Informações</h3>

        <dl className="inventory-details-panel__details">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {actions.length > 0 ? (
        <div className="inventory-details-panel__actions">
          <div className="inventory-item-action-list">
            {actions.map((action) => (
              <button
                key={action.kind}
                type="button"
                className={`inventory-item-action-button inventory-item-action-button--${action.kind}`}
                disabled={isActionBusy}
                onClick={() => onUseItem?.(entry, action)}
              >
                {isActionBusy ? 'Processando...' : action.label}
              </button>
            ))}
          </div>

          {actions[0]?.description ? (
            <span>{actions[0].description}</span>
          ) : null}
        </div>
      ) : null}

      {actionFeedback ? (
        <p
          className={`inventory-item-action-feedback inventory-item-action-feedback--${actionFeedback.tone}`}
          role="status"
        >
          {actionFeedback.message}
        </p>
      ) : null}
    </aside>
  );
}

interface InventoryBlackMarketSaleModalProps {
  entry: InventoryEntry | null;
  quantity: number;
  feedback: InventoryItemActionFeedback | null;
  isBusy: boolean;
  onClose: () => void;
  onQuantityChange: (quantity: number) => void;
  onConfirm: () => void;
}

function InventoryBlackMarketSaleModal({
  entry,
  quantity,
  feedback,
  isBusy,
  onClose,
  onQuantityChange,
  onConfirm,
}: InventoryBlackMarketSaleModalProps) {
  useEffect(() => {
    if (!entry) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [entry, onClose]);

  if (!entry) return null;

  const item = entry.item;
  const itemName = item.name?.trim() || 'Item desconhecido';
  const isStackable = isBlackMarketStackableEntry(entry);
  const maxQuantity = isStackable
    ? Math.max(0, entry.quantity)
    : Math.min(1, Math.max(0, entry.quantity));
  const unitValue = getBlackMarketUnitValue(entry);
  const effectiveQuantity =
    maxQuantity > 0 ? Math.min(quantity, maxQuantity) : 0;
  const totalValue = unitValue * effectiveQuantity;
  const canSell = maxQuantity > 0 && !isBusy;
  const quickQuantities = [1, 5, 10].filter(
    (quickQuantity) => quickQuantity <= Math.max(1, maxQuantity),
  );

  return (
    <div
      className="inventory-black-market-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-black-market-title"
    >
      <button
        type="button"
        className="inventory-black-market-modal__backdrop"
        onClick={onClose}
        aria-label="Fechar venda no Mercado Negro"
      />

      <section
        className={`inventory-black-market-modal__panel rarity-${normalizeRarityClass(
          item.rarity,
        )}`}
      >
        <button
          type="button"
          className="inventory-black-market-modal__close"
          onClick={onClose}
          aria-label="Fechar"
        >
          ×
        </button>

        <div className="inventory-black-market-modal__hero">
          <div
            className="inventory-item-card__icon inventory-black-market-modal__icon"
            aria-hidden="true"
          >
            <span className="inventory-item-card__glyph">
              {getInventoryItemIcon(entry)}
            </span>

            <strong>{getInventoryItemInitials(item)}</strong>
          </div>

          <span>Mercado Negro</span>
          <h2 id="inventory-black-market-title">{itemName}</h2>
        </div>

        <div className="inventory-black-market-modal__summary">
          <div>
            <span>Valor unitário</span>
            <strong>
              <img src={goldIcon} alt="" aria-hidden="true" />
              {formatQuantity(unitValue)}
            </strong>
          </div>

          <div>
            <span>Disponível</span>
            <strong>x{formatQuantity(maxQuantity)}</strong>
          </div>

          <div>
            <span>Total da venda</span>
            <strong>
              <img src={goldIcon} alt="" aria-hidden="true" />
              {formatQuantity(totalValue)}
            </strong>
          </div>
        </div>

        {isStackable ? (
          <div className="inventory-black-market-modal__quantity">
            <label htmlFor="inventory-black-market-quantity">
              Quantidade para vender
            </label>

            <div className="inventory-black-market-modal__quantity-row">
              <button
                type="button"
                onClick={() => onQuantityChange(quantity - 1)}
                disabled={!canSell || quantity <= 1}
              >
                −
              </button>

              <input
                id="inventory-black-market-quantity"
                type="number"
                min={1}
                max={Math.max(1, maxQuantity)}
                value={quantity}
                disabled={!canSell}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  onQuantityChange(Number(event.target.value))
                }
              />

              <button
                type="button"
                onClick={() => onQuantityChange(quantity + 1)}
                disabled={!canSell || quantity >= maxQuantity}
              >
                +
              </button>
            </div>

            <div className="inventory-black-market-modal__quick">
              {quickQuantities.map((quickQuantity) => (
                <button
                  key={quickQuantity}
                  type="button"
                  className={quantity === quickQuantity ? 'is-active' : ''}
                  onClick={() => onQuantityChange(quickQuantity)}
                  disabled={!canSell}
                >
                  {quickQuantity}
                </button>
              ))}

              <button
                type="button"
                className={quantity === maxQuantity ? 'is-active' : ''}
                onClick={() => onQuantityChange(maxQuantity)}
                disabled={!canSell}
              >
                Máx.
              </button>
            </div>
          </div>
        ) : (
          <p className="inventory-black-market-modal__locked-quantity">
            Este item será vendido individualmente.
          </p>
        )}

        {feedback ? (
          <p
            className={`inventory-item-action-feedback inventory-item-action-feedback--${feedback.tone}`}
            role="status"
          >
            {feedback.message}
          </p>
        ) : null}

        <div className="inventory-black-market-modal__actions">
          <button
            type="button"
            className="inventory-item-action-button inventory-item-action-button--blackMarket"
            disabled={!canSell}
            onClick={onConfirm}
          >
            {isBusy ? 'Vendendo...' : 'Confirmar venda'}
          </button>

          <button
            type="button"
            className="inventory-black-market-modal__secondary"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancelar
          </button>
        </div>
      </section>
    </div>
  );
}

export function InventoryPage() {
  const { characterId } = useParams();
  const [activeTab, setActiveTab] = useState<InventoryTabKey>('inventory');
  const [activeFilter, setActiveFilter] = useState<InventoryFilterKey>('ALL');
  const [selection, setSelection] = useState<InventorySelectionState>({
    source: 'inventory',
    entry: null,
    emptySlotLabel: null,
  });
  const isMobileDetails = useIsMobileInventoryDetails();
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isItemActionBusy, setIsItemActionBusy] = useState(false);
  const [itemActionFeedback, setItemActionFeedback] =
    useState<InventoryItemActionFeedback | null>(null);
  const [blackMarketSale, setBlackMarketSale] = useState<{
    entry: InventoryEntry;
    quantity: number;
  } | null>(null);
  const [blackMarketFeedback, setBlackMarketFeedback] =
    useState<InventoryItemActionFeedback | null>(null);
  const [blackMarketPageFeedback, setBlackMarketPageFeedback] =
    useState<InventoryItemActionFeedback | null>(null);
  const [isBlackMarketBusy, setIsBlackMarketBusy] = useState(false);
  const [equipmentSnapshot, setEquipmentSnapshot] =
    useState<DashboardEquipmentViewModel | null>(null);
  const [isEquipmentLoading, setIsEquipmentLoading] = useState(false);
  const [equipmentError, setEquipmentError] = useState('');
  const [bankItems, setBankItems] = useState<InventoryEntry[]>([]);
  const [isBankLoading, setIsBankLoading] = useState(false);
  const [bankError, setBankError] = useState('');

  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(
    null,
  );
  const [isCharacterLoading, setIsCharacterLoading] = useState(true);
  const [characterError, setCharacterError] = useState('');

  const {
    items,
    isLoading: isInventoryLoading,
    error: inventoryError,
    refetch,
  } = useInventory(characterId);

  useEffect(() => {
    if (!blackMarketPageFeedback) return undefined;

    const timeoutId = window.setTimeout(() => {
      setBlackMarketPageFeedback(null);
    }, 5200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [blackMarketPageFeedback]);

  useEffect(() => {
    let isMounted = true;

    async function loadCharacter() {
      if (!characterId) return;

      try {
        setIsCharacterLoading(true);
        setCharacterError('');

        const data = await getCharacterOverview(characterId);

        if (isMounted) {
          setOverview(data);
        }
      } catch {
        if (isMounted) {
          setCharacterError(
            'Não foi possível carregar os dados do personagem.',
          );
        }
      } finally {
        if (isMounted) {
          setIsCharacterLoading(false);
        }
      }
    }

    loadCharacter();

    return () => {
      isMounted = false;
    };
  }, [characterId]);

  async function refreshCharacterOverview() {
    if (!characterId) return;

    const data = await getCharacterOverview(characterId);

    setOverview(data);
  }

  async function refreshEquipmentSnapshot() {
    if (!characterId) return;

    const data = await getCharacterEquipment(characterId);

    setEquipmentSnapshot(data.equipment ?? {});
  }

  async function refreshBankItems() {
    if (!characterId) return;

    const data = await getCharacterBank(characterId);

    setBankItems(data.items ?? []);
  }

  useEffect(() => {
    if (!characterId || activeTab !== 'equipped') return undefined;

    let isMounted = true;
    const selectedCharacterId = characterId;

    async function loadEquipment() {
      try {
        setIsEquipmentLoading(true);
        setEquipmentError('');

        const data = await getCharacterEquipment(selectedCharacterId);

        if (isMounted) {
          setEquipmentSnapshot(data.equipment ?? {});
        }
      } catch {
        if (isMounted) {
          setEquipmentError(
            'N\u00e3o foi poss\u00edvel carregar os equipamentos.',
          );
        }
      } finally {
        if (isMounted) {
          setIsEquipmentLoading(false);
        }
      }
    }

    loadEquipment();

    return () => {
      isMounted = false;
    };
  }, [activeTab, characterId]);

  useEffect(() => {
    if (!characterId || activeTab !== 'bank') return undefined;

    let isMounted = true;
    const selectedCharacterId = characterId;

    async function loadBank() {
      try {
        setIsBankLoading(true);
        setBankError('');

        const data = await getCharacterBank(selectedCharacterId);

        if (isMounted) {
          setBankItems(data.items ?? []);
        }
      } catch {
        if (isMounted) {
          setBankError('N\u00e3o foi poss\u00edvel carregar o banco.');
        }
      } finally {
        if (isMounted) {
          setIsBankLoading(false);
        }
      }
    }

    loadBank();

    return () => {
      isMounted = false;
    };
  }, [activeTab, characterId]);

  const character = useMemo(() => {
    if (!overview) return null;

    return buildCharacterViewModel(overview);
  }, [overview]);

  const equipmentForDisplay = useMemo<DashboardEquipmentViewModel>(() => {
    return equipmentSnapshot ?? character?.equipment ?? {};
  }, [character?.equipment, equipmentSnapshot]);

  const filters = useMemo(() => buildInventoryFilters(items), [items]);

  const filteredItems = useMemo(() => {
    return filterInventoryItems(items, activeFilter);
  }, [activeFilter, items]);

  const selectedDetailsItem = useMemo(() => {
    if (!selection.entry || selection.source !== activeTab) return null;

    if (activeTab === 'equipped') {
      const currentSelectedItem = findEquipmentItemById(
        equipmentForDisplay,
        selection.entry.item.id,
      );

      return currentSelectedItem
        ? buildEquippedInventoryEntry(currentSelectedItem)
        : null;
    }

    if (activeTab === 'bank') {
      const currentSelectedItemId = getInventoryEntryId(selection.entry);

      return (
        bankItems.find((entry) => {
          return getInventoryEntryId(entry) === currentSelectedItemId;
        }) ?? null
      );
    }

    if (activeTab !== 'inventory') {
      return selection.entry;
    }

    const currentSelectedItemId = getInventoryEntryId(selection.entry);

    return (
      filteredItems.find((entry) => {
        return getInventoryEntryId(entry) === currentSelectedItemId;
      }) ?? null
    );
  }, [activeTab, bankItems, equipmentForDisplay, filteredItems, selection]);

  const selectedItemActions = useMemo(() => {
    return getInventoryItemActions(selectedDetailsItem, activeTab);
  }, [activeTab, selectedDetailsItem]);

  const selectedItemId = getInventoryEntryId(selectedDetailsItem);
  const selectedEmptySlotLabel =
    selection.source === activeTab ? selection.emptySlotLabel : null;

  const hasItems = items.length > 0;
  const hasFilteredItems = filteredItems.length > 0;
  const isEmptyAfterFilter = hasItems && !hasFilteredItems;
  const isCompletelyEmpty = !hasItems;
  const hasBankItems = bankItems.length > 0;

  function updateSelection(nextSelection: InventorySelectionState) {
    setSelection(nextSelection);
    setIsDetailsModalOpen(Boolean(isMobileDetails && nextSelection.entry));
    setItemActionFeedback(null);
  }

  function clearSelection(source: InventorySelectionSource = activeTab) {
    setSelection({
      source,
      entry: null,
      emptySlotLabel: null,
    });
    setIsDetailsModalOpen(false);
    setItemActionFeedback(null);
  }

  async function handleUseInventoryItem(
    entry: InventoryEntry,
    requestedAction: InventoryItemActionViewModel,
  ) {
    if (!characterId) return;

    const action = getInventoryItemActions(entry, activeTab).find((itemAction) => {
      return itemAction.kind === requestedAction.kind;
    });

    if (!action) return;

    if (action.kind === 'blackMarket') {
      setBlackMarketSale({
        entry,
        quantity: clampSaleQuantity(entry, 1),
      });
      setBlackMarketFeedback(null);
      setBlackMarketPageFeedback(null);
      setIsDetailsModalOpen(false);

      return;
    }

    setIsItemActionBusy(true);
    setItemActionFeedback(null);

    try {
      const payload = {
        characterId,
        itemId: entry.item.id,
      };

      const storagePayload = {
        ...payload,
        quantity: entry.quantity,
      };

      const result =
        action.kind === 'equip'
          ? await equipInventoryItem(payload)
          : action.kind === 'unequip'
            ? await unequipInventoryItem({
                characterId,
                slot: String(entry.item.slot ?? ''),
              })
            : action.kind === 'deposit'
              ? await depositInventoryItemToBank(storagePayload)
              : action.kind === 'withdraw'
                ? await withdrawInventoryItemFromBank(storagePayload)
                : await consumeInventoryItem(payload);

      setItemActionFeedback({
        tone: 'success',
        message:
          result.message ??
          (action.kind === 'equip'
            ? 'Item equipado com sucesso.'
            : action.kind === 'unequip'
              ? 'Item desequipado com sucesso.'
              : action.kind === 'deposit'
                ? 'Item enviado ao banco.'
                : action.kind === 'withdraw'
                  ? 'Item retirado do banco.'
                  : 'Item usado com sucesso.'),
      });

      await Promise.allSettled([
        refetch(),
        refreshCharacterOverview(),
        refreshEquipmentSnapshot(),
        refreshBankItems(),
      ]);

      if (action.kind === 'unequip') {
        clearSelection('equipped');
      } else if (action.kind === 'deposit') {
        clearSelection('inventory');
      } else if (action.kind === 'withdraw') {
        clearSelection('bank');
      }
    } catch (error) {
      setItemActionFeedback({
        tone: 'error',
        message: extractInventoryActionApiError(
          error,
          action.kind === 'equip'
            ? 'N\u00e3o foi poss\u00edvel equipar este item.'
            : action.kind === 'unequip'
              ? 'N\u00e3o foi poss\u00edvel desequipar este item.'
              : action.kind === 'deposit'
                ? 'N\u00e3o foi poss\u00edvel enviar este item ao banco.'
                : action.kind === 'withdraw'
                  ? 'N\u00e3o foi poss\u00edvel retirar este item do banco.'
                  : 'N\u00e3o foi poss\u00edvel usar este consum\u00edvel.',
        ),
      });
    } finally {
      setIsItemActionBusy(false);
    }
  }

  function handleBlackMarketQuantityChange(quantity: number) {
    setBlackMarketSale((currentSale) => {
      if (!currentSale) return currentSale;

      return {
        ...currentSale,
        quantity: clampSaleQuantity(currentSale.entry, quantity),
      };
    });
    setBlackMarketFeedback(null);
  }

  async function handleConfirmBlackMarketSale() {
    if (!characterId || !blackMarketSale || isBlackMarketBusy) return;

    const { entry, quantity } = blackMarketSale;

    setIsBlackMarketBusy(true);
    setBlackMarketFeedback(null);

    try {
      const result = await sellInventoryItemToBlackMarket({
        characterId,
        itemId: entry.item.id,
        quantity,
      });

      const soldQuantity = result.soldItem?.quantity ?? quantity;
      const successMessage =
        result.message ??
        `${soldQuantity}x ${entry.item.name} vendido no Mercado Negro.`;
      const remainingQuantity = Math.max(0, entry.quantity - soldQuantity);

      setItemActionFeedback({
        tone: 'success',
        message: successMessage,
      });

      if (remainingQuantity <= 0) {
        setBlackMarketSale(null);
        setBlackMarketFeedback(null);
        setBlackMarketPageFeedback({
          tone: 'success',
          message: successMessage,
        });
        setSelection({
          source: 'inventory',
          entry: null,
          emptySlotLabel: null,
        });
        setIsDetailsModalOpen(false);
      } else {
        setBlackMarketSale({
          entry: {
            ...entry,
            quantity: remainingQuantity,
          },
          quantity: 1,
        });

        setBlackMarketFeedback({
          tone: 'success',
          message: successMessage,
        });
      }

      await Promise.allSettled([refetch(), refreshCharacterOverview()]);
    } catch (error) {
      const message = extractInventoryActionApiError(
        error,
        'Não foi possível vender este item no Mercado Negro.',
      );

      setBlackMarketFeedback({
        tone: 'error',
        message,
      });
      setItemActionFeedback({
        tone: 'error',
        message,
      });
    } finally {
      setIsBlackMarketBusy(false);
    }
  }

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isCharacterLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando mochila...</span>
      </main>
    );
  }

  if (characterError || !character) {
    return (
      <main className="dashboard-error">
        <h1>Erro ao carregar mochila</h1>
        <p>{characterError || 'Personagem não encontrado.'}</p>
      </main>
    );
  }

  return (
    <DashboardLayout character={character} hideHero>
      <main
        className="inventory-page inventory-page--dashboard"
        aria-label="Mochila do personagem"
      >
        {blackMarketPageFeedback ? (
          <div
            className={`inventory-black-market-notice inventory-black-market-notice--${blackMarketPageFeedback.tone}`}
            role="status"
          >
            <div>
              <span>Mercado Negro</span>
              <strong>{blackMarketPageFeedback.message}</strong>
            </div>

            <button
              type="button"
              onClick={() => setBlackMarketPageFeedback(null)}
              aria-label="Dispensar mensagem"
            >
              ×
            </button>
          </div>
        ) : null}

        <div className="inventory-content-layout">
          <section
            className="inventory-panel inventory-panel--items inventory-content-layout__grid"
            aria-label="Mochila, equipamentos e banco do personagem"
          >
            <div
              className="inventory-tabs"
              role="tablist"
              aria-label="Seções da mochila"
            >
              {INVENTORY_TABS.map((tab) => {
                const isActive = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    className={`inventory-tab${isActive ? ' is-active' : ''}`}
                    onClick={() => {
                      setActiveTab(tab.key);
                      clearSelection(tab.key);
                    }}
                    role="tab"
                    aria-selected={isActive}
                  >
                    <span className="inventory-tab__label">{tab.label}</span>
                    <small className="inventory-tab__description">
                      {tab.description}
                    </small>
                  </button>
                );
              })}
            </div>

            {activeTab === 'inventory' ? (
              <>
                <div className="inventory-panel__header inventory-panel__header--stacked">
                  <div>
                    <span>Mochila</span>
                    <h2 id="inventory-items-title">Itens guardados</h2>
                  </div>

                  <p>
                    <strong>{filteredItems.length}</strong> de {items.length}{' '}
                    tipos visíveis
                  </p>
                </div>

                <InventoryFilters
                  filters={filters}
                  activeFilter={activeFilter}
                  onChange={(filter) => {
                    setActiveFilter(filter);
                    clearSelection('inventory');
                  }}
                />

                {isInventoryLoading ? (
                  <div className="inventory-state-card">
                    <div className="loading-spinner" />
                    <span>Carregando itens...</span>
                  </div>
                ) : null}

                {!isInventoryLoading && inventoryError ? (
                  <div className="inventory-state-card inventory-state-card--error">
                    <strong>Falha ao carregar inventário</strong>
                    <p>{inventoryError}</p>

                    <button type="button" onClick={refetch}>
                      Tentar novamente
                    </button>
                  </div>
                ) : null}

                {!isInventoryLoading && !inventoryError && hasFilteredItems ? (
                  <div className="inventory-grid-shell">
                    <InventoryGrid
                      items={filteredItems}
                      onSelectItem={(entry) => {
                        updateSelection({
                          source: 'inventory',
                          entry,
                          emptySlotLabel: null,
                        });
                      }}
                      selectedItemId={selectedItemId}
                    />
                  </div>
                ) : null}

                {!isInventoryLoading &&
                !inventoryError &&
                isEmptyAfterFilter ? (
                  <EmptyInventoryState hasActiveFilter />
                ) : null}

                {!isInventoryLoading && !inventoryError && isCompletelyEmpty ? (
                  <EmptyInventoryState hasActiveFilter={false} />
                ) : null}
              </>
            ) : null}

            {activeTab === 'equipped' ? (
              <section
                className="inventory-equipped-tab"
                aria-labelledby="inventory-equipped-title"
              >
                <div className="inventory-panel__header inventory-panel__header--stacked">
                  <div>
                    <span>Equipados</span>
                    <h2 id="inventory-equipped-title">Conjunto atual</h2>
                  </div>

                  <Link
                    className="inventory-panel__action-link"
                    to={`/dashboard/${character.id}/equipment`}
                  >
                    Gerenciar equipamentos
                  </Link>
                </div>

                <div className="inventory-equipped-shell">
                  {isEquipmentLoading ? (
                    <div className="inventory-equipped-status">
                      Atualizando equipamentos...
                    </div>
                  ) : null}

                  {!isEquipmentLoading && equipmentError ? (
                    <div className="inventory-equipped-status inventory-equipped-status--error">
                      {equipmentError}
                    </div>
                  ) : null}

                  <DashboardEquipmentBody
                    equipment={equipmentForDisplay}
                    selectedItemId={selectedItemId}
                    onSelectSlot={({ item, label }) => {
                      updateSelection({
                        source: 'equipped',
                        entry: item ? buildEquippedInventoryEntry(item) : null,
                        emptySlotLabel: item ? null : label,
                      });
                    }}
                  />
                </div>
              </section>
            ) : null}

            {activeTab === 'bank' ? (
              <section
                className="inventory-bank-tab"
                aria-labelledby="inventory-bank-title"
              >
                <div className="inventory-panel__header inventory-panel__header--stacked">
                  <div>
                    <span>Banco</span>
                    <h2 id="inventory-bank-title">Armazenamento</h2>
                  </div>

                  <p>
                    <strong>{bankItems.length}</strong> tipos guardados
                  </p>
                </div>

                {isBankLoading ? (
                  <div className="inventory-state-card">
                    <div className="loading-spinner" />
                    <span>Carregando banco...</span>
                  </div>
                ) : null}

                {!isBankLoading && bankError ? (
                  <div className="inventory-state-card inventory-state-card--error">
                    <strong>Falha ao carregar banco</strong>
                    <p>{bankError}</p>

                    <button type="button" onClick={refreshBankItems}>
                      Tentar novamente
                    </button>
                  </div>
                ) : null}

                {!isBankLoading && !bankError ? (
                  <div className="inventory-grid-shell inventory-grid-shell--bank">
                    <InventoryGrid
                      items={bankItems}
                      onSelectItem={(entry) => {
                        updateSelection({
                          source: 'bank',
                          entry,
                          emptySlotLabel: null,
                        });
                      }}
                      selectedItemId={selectedItemId}
                      ariaLabel="Grade de slots do banco"
                      emptySlotLabel="Vazio"
                      onSelectEmptySlot={(slotNumber) => {
                        updateSelection({
                          source: 'bank',
                          entry: null,
                          emptySlotLabel: `Slot ${slotNumber}`,
                        });
                      }}
                    />
                  </div>
                ) : null}

                {!isBankLoading && !bankError && !hasBankItems ? (
                  <div className="inventory-state-card inventory-state-card--compact">
                    <strong>Banco vazio</strong>
                    <p>
                      Selecione um item da mochila e use Enviar ao banco para
                      liberar espa\u00e7o no invent\u00e1rio.
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}
          </section>

          <div className="inventory-content-layout__details">
            <InventoryDesktopDetailsPanel
              entry={selectedDetailsItem}
              emptyText={EMPTY_PANEL_TEXT}
              emptySlotLabel={selectedEmptySlotLabel}
              onClear={() => clearSelection()}
              actions={selectedItemActions}
              actionFeedback={itemActionFeedback}
              isActionBusy={isItemActionBusy}
              onUseItem={handleUseInventoryItem}
            />
          </div>
        </div>

        <InventoryItemDetailsModal
          entry={
            isMobileDetails && isDetailsModalOpen ? selectedDetailsItem : null
          }
          onClose={() => setIsDetailsModalOpen(false)}
          actions={selectedItemActions}
          actionFeedback={itemActionFeedback}
          isActionBusy={isItemActionBusy}
          onUseItem={handleUseInventoryItem}
        />

        <InventoryBlackMarketSaleModal
          entry={blackMarketSale?.entry ?? null}
          quantity={blackMarketSale?.quantity ?? 1}
          feedback={blackMarketFeedback}
          isBusy={isBlackMarketBusy}
          onClose={() => {
            if (isBlackMarketBusy) return;
            setBlackMarketSale(null);
            setBlackMarketFeedback(null);
          }}
          onQuantityChange={handleBlackMarketQuantityChange}
          onConfirm={handleConfirmBlackMarketSale}
        />
      </main>
    </DashboardLayout>
  );
}

export default InventoryPage;
