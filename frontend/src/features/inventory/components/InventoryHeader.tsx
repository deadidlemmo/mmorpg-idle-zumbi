interface InventoryHeaderProps {
  totalTypes: number;
  totalQuantity: number;
  equipmentCount: number;
  materialCount: number;
  onRefresh: () => void;
}

function formatCompactNumber(value: number) {
  const safeValue = Math.max(0, Math.floor(Number(value) || 0));

  if (safeValue >= 1000000) {
    return `${(safeValue / 1000000).toFixed(safeValue >= 10000000 ? 0 : 1)}M`;
  }

  if (safeValue >= 1000) {
    return `${(safeValue / 1000).toFixed(safeValue >= 10000 ? 0 : 1)}K`;
  }

  return String(safeValue);
}

export function InventoryHeader({
  totalTypes,
  totalQuantity,
  equipmentCount,
  materialCount,
  onRefresh,
}: InventoryHeaderProps) {
  return (
    <header className="inventory-hero" aria-label="Resumo da mochila">
      <div className="inventory-hero__copy">
        <span className="inventory-hero__eyebrow">Mochila</span>

        <h1>Inventário</h1>

        <p>
          Organize equipamentos, materiais, consumíveis e recursos obtidos em
          combate, expedições e criação.
        </p>
      </div>

      <div className="inventory-hero__actions">
        <button
          type="button"
          className="inventory-refresh-button"
          onClick={onRefresh}
          aria-label="Atualizar inventário"
        >
          Atualizar
        </button>
      </div>

      <div className="inventory-hero__stats" aria-label="Resumo dos itens">
        <div>
          <strong title={`${totalTypes} tipos`}>
            {formatCompactNumber(totalTypes)}
          </strong>
          <span>Tipos</span>
        </div>

        <div>
          <strong title={`${totalQuantity} itens`}>
            {formatCompactNumber(totalQuantity)}
          </strong>
          <span>Itens</span>
        </div>

        <div>
          <strong title={`${equipmentCount} equipamentos`}>
            {formatCompactNumber(equipmentCount)}
          </strong>
          <span>Equip.</span>
        </div>

        <div>
          <strong title={`${materialCount} materiais`}>
            {formatCompactNumber(materialCount)}
          </strong>
          <span>Materiais</span>
        </div>
      </div>
    </header>
  );
}