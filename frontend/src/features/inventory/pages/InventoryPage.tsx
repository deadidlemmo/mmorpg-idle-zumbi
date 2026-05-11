import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
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

export function InventoryPage() {
  const { characterId } = useParams();
  const [activeFilter, setActiveFilter] = useState<InventoryFilterKey>('ALL');
  const [selectedItem, setSelectedItem] = useState<InventoryEntry | null>(null);

  const {
    items,
    isLoading: isInventoryLoading,
    error: inventoryError,
    refetch,
  } = useInventory(characterId);

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

  return (
    <main className="inventory-page" aria-label="Mochila do personagem">
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
    </main>
  );
}
