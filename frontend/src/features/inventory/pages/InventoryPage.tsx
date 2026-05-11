import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from '../../dashboard/types/dashboard.types';
import { EmptyInventoryState } from '../components/EmptyInventoryState';
import { InventoryFilters } from '../components/InventoryFilters';
import { InventoryGrid } from '../components/InventoryGrid';
import { InventoryHeader } from '../components/InventoryHeader';
import { InventoryItemDetailsModal } from '../components/InventoryItemDetailsModal';
import { useInventory } from '../hooks/useInventory';
import '../styles/inventory.css';
import type { InventoryEntry, InventoryFilterKey } from '../types/inventory.types';
import {
  buildInventoryFilters,
  filterInventoryItems,
} from '../utils/inventory.utils';

function buildCharacterViewModel(
  overview: CharacterOverviewResponse,
): DashboardCharacterViewModel {
  const character = overview.character;
  const className = character.class?.name ?? character.gameClass?.name ?? 'Lutador';
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
    totalXp: character.totalXp ?? character.levelProgress?.totalXp ?? character.xp ?? 0,
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
      character.xpNeededForNextLevel ?? character.levelProgress?.xpNeededForNextLevel ?? null,
    currentLevelStartXp:
      character.currentLevelStartXp ?? character.levelProgress?.currentLevelStartXp ?? null,
    nextLevelRequiredXp:
      character.nextLevelRequiredXp ?? character.levelProgress?.nextLevelRequiredXp ?? null,
    isAtLevelCap: character.isAtLevelCap ?? character.levelProgress?.isAtLevelCap ?? false,
    levelProgress: character.levelProgress ?? null,
    status: character.status ?? 'ACTIVE',
    currentHp: character.currentHp ?? character.maxHp ?? 1,
    maxHp: character.maxHp ?? 1,
    currentMapName,
    currentMap: character.currentMap ?? overview.progression?.currentMap ?? null,
    equipment: character.equipment ?? overview.equipment ?? {},
    inventory: character.inventory ?? [],
  };
}

export function InventoryPage() {
  const { characterId } = useParams();
  const [activeFilter, setActiveFilter] = useState<InventoryFilterKey>('ALL');
  const [selectedItem, setSelectedItem] = useState<InventoryEntry | null>(null);
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(null);
  const [isCharacterLoading, setIsCharacterLoading] = useState(true);

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
        const data = await getCharacterOverview(characterId);

        if (isMounted) {
          setOverview(data);
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
  const filteredItems = useMemo(
    () => filterInventoryItems(items, activeFilter),
    [activeFilter, items],
  );

  const totalQuantity = useMemo(
    () => items.reduce((total, entry) => total + (entry.quantity ?? 0), 0),
    [items],
  );

  const equipmentCount = filters.find((filter) => filter.key === 'EQUIPMENT')?.count ?? 0;
  const materialCount = filters.find((filter) => filter.key === 'MATERIAL')?.count ?? 0;

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

  if (!character) {
    return <Navigate to="/characters" replace />;
  }

  return (
    <DashboardLayout character={character} hideHero hideTopBar>
      <div className="inventory-page" aria-label="Mochila do personagem">
        <InventoryHeader
          totalTypes={items.length}
          totalQuantity={totalQuantity}
          equipmentCount={equipmentCount}
          materialCount={materialCount}
          onRefresh={refetch}
        />

        <section className="inventory-panel" aria-labelledby="inventory-items-title">
          <div className="inventory-panel__header">
            <div>
              <span>Mochila</span>
              <h2 id="inventory-items-title">Itens guardados</h2>
            </div>
            <p>{filteredItems.length} de {items.length} tipos visíveis</p>
          </div>

          <InventoryFilters
            filters={filters}
            activeFilter={activeFilter}
            onChange={setActiveFilter}
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
              <button type="button" onClick={refetch}>Tentar novamente</button>
            </div>
          ) : null}

          {!isInventoryLoading && !inventoryError && filteredItems.length > 0 ? (
            <InventoryGrid items={filteredItems} onSelectItem={setSelectedItem} />
          ) : null}

          {!isInventoryLoading && !inventoryError && filteredItems.length === 0 ? (
            <EmptyInventoryState hasActiveFilter={activeFilter !== 'ALL'} />
          ) : null}
        </section>

        <InventoryItemDetailsModal
          entry={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      </div>
    </DashboardLayout>
  );
}
