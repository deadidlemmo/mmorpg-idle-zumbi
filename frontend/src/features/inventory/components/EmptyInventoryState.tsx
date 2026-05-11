interface EmptyInventoryStateProps {
  hasActiveFilter?: boolean;
}

export function EmptyInventoryState({ hasActiveFilter = false }: EmptyInventoryStateProps) {
  return (
    <div className="inventory-empty-state">
      <div className="inventory-empty-state__icon" aria-hidden="true">▦</div>
      <strong>{hasActiveFilter ? 'Nenhum item nesta categoria' : 'Mochila vazia'}</strong>
      <p>
        {hasActiveFilter
          ? 'Tente alternar para Todos ou colete novos recursos em expedições e combates.'
          : 'Itens coletados em combate automático, expedições e criação aparecerão aqui.'}
      </p>
    </div>
  );
}
