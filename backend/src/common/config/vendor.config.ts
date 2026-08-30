export const VENDOR_FIXED_BUY_PRICE_BY_NAME: Readonly<Record<string, number>> =
  {
    'Poção de Vida Menor': 55,
    'Poção de Vida Leve': 55,
    'Poção de Vida': 55,
    'Poção de Vida Maior': 180,
    'Poção de Vida Superior': 420,
    'Poção de Vida Suprema': 900,
    'Pocao Pequena de Vida': 55,
    'Pocao Media de Vida': 55,
    'Pocao Grande de Vida': 180,
  };

export function getVendorFixedBuyPrice(itemName: string) {
  return VENDOR_FIXED_BUY_PRICE_BY_NAME[itemName] ?? null;
}
