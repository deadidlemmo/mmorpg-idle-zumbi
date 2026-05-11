interface InventoryHeaderProps {
  totalTypes: number;
  totalQuantity: number;
  equipmentCount: number;
  materialCount: number;
  onRefresh: () => void;
}

export function InventoryHeader({
  totalTypes,
  totalQuantity,
  equipmentCount,
  materialCount,
  onRefresh,
}: InventoryHeaderProps) {
  return (
    <header className="inventory-hero">
      <div className="inventory-hero__copy">
        <span className="inventory-hero__eyebrow">Arsenal de sobrevivência</span>
        <h1>Mochila</h1>
        <p>Itens coletados em combates, expedições e criação ficam organizados aqui.</p>
      </div>

      <div className="inventory-hero__actions">
        <button type="button" className="inventory-refresh-button" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      <div className="inventory-hero__stats" aria-label="Resumo da mochila">
        <div>
          <strong>{totalTypes}</strong>
          <span>tipos</span>
        </div>
        <div>
          <strong>{totalQuantity}</strong>
          <span>itens</span>
        </div>
        <div>
          <strong>{equipmentCount}</strong>
          <span>equip.</span>
        </div>
        <div>
          <strong>{materialCount}</strong>
          <span>materiais</span>
        </div>
      </div>
    </header>
  );
}
