import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import { DashboardEquipmentBody } from '../../dashboard/components/DashboardEquipmentBody';
import '../../dashboard/dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from '../../dashboard/types/dashboard.types';
import { EmptyInventoryState } from '../components/EmptyInventoryState';
import { InventoryFilters } from '../components/InventoryFilters';
import { InventoryGrid } from '../components/InventoryGrid';
import { InventoryItemDetailsModal } from '../components/InventoryItemDetailsModal';
import { useInventory } from '../hooks/useInventory';
import '../styles/inventory.css';
import type { InventoryEntry, InventoryFilterKey } from '../types/inventory.types';
import {
  buildInventoryFilters,
  filterInventoryItems,
  formatInventoryRarity,
  formatInventorySlot,
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
      character.totalXp ?? character.levelProgress?.totalXp ?? character.xp ?? 0,

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
    currentMap: character.currentMap ?? overview.progression?.currentMap ?? null,

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

function getInventoryEntryId(entry?: InventoryEntry | null) {
  if (!entry) return null;

  const looseEntry = entry as InventoryEntryLoose;

  return looseEntry.inventoryItemId ?? looseEntry.id ?? looseEntry.item?.id ?? null;
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
    ['Slot', formatInventorySlot(item.slot)],
    ['Origem', formatMaterialOrigin(item.materialOrigin)],
    ['Família', item.family ?? null],
    ['Mapa', item.map?.name ?? null],
    ['Classe', item.class?.name ?? null],
  ];

  return details.filter(
    (detail): detail is [string, string] => Boolean(detail[1]),
  );
}

function useIsMobileInventoryDetails() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 980px)');

    function updateIsMobile() {
      setIsMobile(mediaQuery.matches);
    }

    updateIsMobile();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateIsMobile);

      return () => {
        mediaQuery.removeEventListener('change', updateIsMobile);
      };
    }

    mediaQuery.addListener(updateIsMobile);

    return () => {
      mediaQuery.removeListener(updateIsMobile);
    };
  }, []);

  return isMobile;
}

interface InventoryDesktopDetailsPanelProps {
  entry: InventoryEntry | null;
  onClear: () => void;
}

function InventoryDesktopDetailsPanel({
  entry,
  onClear,
}: InventoryDesktopDetailsPanelProps) {
  if (!entry) {
    return (
      <aside
        className="inventory-details-panel inventory-details-panel--empty"
        aria-label="Detalhes do item"
      >
        <div className="inventory-details-panel__empty-icon">▦</div>

        <strong>Selecione um item</strong>

        <p>
          Clique em um slot da mochila para visualizar detalhes, quantidade,
          raridade, atributos e origem do item.
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

          {typeof item.tier === 'number' ? (
            <span>Tier {item.tier}</span>
          ) : null}
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
    </aside>
  );
}

export function InventoryPage() {
  const { characterId } = useParams();

  const isMobileDetails = useIsMobileInventoryDetails();

  const [activeTab, setActiveTab] = useState<InventoryTabKey>('inventory');
  const [activeFilter, setActiveFilter] = useState<InventoryFilterKey>('ALL');
  const [selectedItem, setSelectedItem] = useState<InventoryEntry | null>(null);

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
          setCharacterError('Não foi possível carregar os dados do personagem.');
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

  const character = useMemo(() => {
    if (!overview) return null;

    return buildCharacterViewModel(overview);
  }, [overview]);

  const filters = useMemo(() => buildInventoryFilters(items), [items]);

  const filteredItems = useMemo(() => {
    return filterInventoryItems(items, activeFilter);
  }, [activeFilter, items]);

  const selectedInventoryItem = useMemo(() => {
    if (activeTab !== 'inventory' || !selectedItem) return null;

    const currentSelectedItemId = getInventoryEntryId(selectedItem);

    return (
      filteredItems.find((entry) => {
        return getInventoryEntryId(entry) === currentSelectedItemId;
      }) ?? null
    );
  }, [activeTab, filteredItems, selectedItem]);

  const selectedItemId = getInventoryEntryId(selectedInventoryItem);

  const hasItems = items.length > 0;
  const hasFilteredItems = filteredItems.length > 0;
  const isEmptyAfterFilter = hasItems && !hasFilteredItems;
  const isCompletelyEmpty = !hasItems;

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
        <div
          className={`inventory-content-layout${
            activeTab === 'inventory' ? '' : ' inventory-content-layout--single'
          }`}
        >
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
                      setSelectedItem(null);
                    }}
                    role="tab"
                    aria-selected={isActive}
                  >
                    <span>{tab.label}</span>
                    <small>{tab.description}</small>
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
                    <small>
                      Gerencie recursos, equipamentos e consumíveis coletados nas
                      expedições e combates.
                    </small>
                  </div>

                  <p>
                    <strong>{filteredItems.length}</strong> de {items.length} tipos visíveis
                  </p>
                </div>

                <InventoryFilters
                  filters={filters}
                  activeFilter={activeFilter}
                  onChange={(filter) => {
                    setActiveFilter(filter);
                    setSelectedItem(null);
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
                      onSelectItem={setSelectedItem}
                      selectedItemId={selectedItemId}
                    />
                  </div>
                ) : null}

                {!isInventoryLoading && !inventoryError && isEmptyAfterFilter ? (
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
                    <small>
                      Slots ativos do personagem. Espaços sem item aparecem como Vazio.
                    </small>
                  </div>

                  <Link
                    className="inventory-panel__action-link"
                    to={`/dashboard/${character.id}/equipment`}
                  >
                    Gerenciar equipamentos
                  </Link>
                </div>

                <div className="inventory-equipped-shell">
                  <DashboardEquipmentBody equipment={character.equipment ?? {}} />
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
                    <small>
                      Espaço reservado para itens guardados em áreas seguras.
                    </small>
                  </div>
                </div>

                <div className="inventory-bank-unavailable" role="status">
                  <div className="inventory-bank-unavailable__icon" aria-hidden="true">
                    ▣
                  </div>
                  <strong>Banco indisponível</strong>
                  <p>
                    Você não está próximo de um banco ou esta funcionalidade ainda não
                    está disponível nesta área.
                  </p>
                </div>
              </section>
            ) : null}
          </section>

          {activeTab === 'inventory' && !isInventoryLoading && !inventoryError ? (
            <div className="inventory-content-layout__details">
              <InventoryDesktopDetailsPanel
                entry={selectedInventoryItem}
                onClear={() => setSelectedItem(null)}
              />
            </div>
          ) : null}
        </div>

        {isMobileDetails ? (
          <InventoryItemDetailsModal
            entry={selectedInventoryItem}
            onClose={() => setSelectedItem(null)}
          />
        ) : null}
      </main>
    </DashboardLayout>
  );
}

export default InventoryPage;