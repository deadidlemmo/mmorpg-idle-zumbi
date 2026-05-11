import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { normalizeClassName } from '../../characters/api/characters.api';
import { getCharacterOverview } from '../../dashboard/api/dashboard.api';
import { DashboardCard } from '../../dashboard/components/DashboardCard';
import { DashboardLayout } from '../../dashboard/components/DashboardLayout';
import '../../dashboard/dashboard.css';
import '../styles/inventory.css';
import type {
  CharacterOverviewResponse,
  DashboardCharacterViewModel,
} from '../../dashboard/types/dashboard.types';
import { EmptyInventoryState } from '../components/EmptyInventoryState';
import { InventoryFilters } from '../components/InventoryFilters';
import { InventoryGrid } from '../components/InventoryGrid';
import { useInventory } from '../hooks/useInventory';
import type { InventoryFilterKey } from '../types/inventory.types';
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
    classId: normalizeClassName(className),
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

export function InventoryPage() {
  const { characterId } = useParams();
  const [overview, setOverview] = useState<CharacterOverviewResponse | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<InventoryFilterKey>('ALL');

  const {
    items,
    isLoading: isInventoryLoading,
    error: inventoryError,
    refetch,
  } = useInventory(characterId);

  useEffect(() => {
    let isMounted = true;

    async function loadOverview() {
      if (!characterId) return;

      try {
        setIsOverviewLoading(true);
        setOverviewError(null);
        const data = await getCharacterOverview(characterId);

        if (isMounted) {
          setOverview(data);
        }
      } catch {
        if (isMounted) {
          setOverviewError('Não foi possível carregar os dados do personagem.');
        }
      } finally {
        if (isMounted) {
          setIsOverviewLoading(false);
        }
      }
    }

    loadOverview();

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

  if (!characterId) {
    return <Navigate to="/characters" replace />;
  }

  if (isOverviewLoading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-spinner" />
        <span>Carregando mochila...</span>
      </main>
    );
  }

  if (!character || overviewError) {
    return <Navigate to="/characters" replace />;
  }

  return (
    <DashboardLayout character={character}>
      <section className="inventory-page">
        <div className="inventory-hero">
          <div>
            <span className="inventory-hero__eyebrow">Arsenal de sobrevivência</span>
            <h1>Mochila</h1>
            <p>
              Visualize materiais, equipamentos, consumíveis e recursos coletados
              pelo personagem durante combates, expedições e criação.
            </p>
          </div>

          <div className="inventory-hero__stats" aria-label="Resumo da mochila">
            <div>
              <strong>{items.length}</strong>
              <span>tipos</span>
            </div>
            <div>
              <strong>{totalQuantity}</strong>
              <span>itens</span>
            </div>
          </div>
        </div>

        <DashboardCard
          title="Itens guardados"
          eyebrow="Mochila"
          action={
            <button type="button" className="inventory-refresh-button" onClick={refetch}>
              Atualizar
            </button>
          }
        >
          <div className="inventory-panel">
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
              <InventoryGrid items={filteredItems} />
            ) : null}

            {!isInventoryLoading && !inventoryError && filteredItems.length === 0 ? (
              <EmptyInventoryState hasActiveFilter={activeFilter !== 'ALL'} />
            ) : null}
          </div>
        </DashboardCard>
      </section>
    </DashboardLayout>
  );
}
