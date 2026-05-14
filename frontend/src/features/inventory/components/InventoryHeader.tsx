interface InventoryHeaderProps {
  totalTypes: number;
  totalQuantity: number;
  equipmentCount: number;
  materialCount: number;
  onRefresh: () => void;
}

/**
 * Header removido visualmente da página de inventário.
 *
 * Mantemos o componente existindo para não precisar alterar imediatamente
 * o InventoryPage.tsx, que ainda passa as props abaixo:
 * - totalTypes
 * - totalQuantity
 * - equipmentCount
 * - materialCount
 * - onRefresh
 */
export function InventoryHeader(props: InventoryHeaderProps) {
  void props;

  return null;
}