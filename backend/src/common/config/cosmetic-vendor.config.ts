export type CosmeticVendorCategory =
  | 'avatar'
  | 'frame'
  | 'card'
  | 'overview'
  | 'effect'
  | 'identity';

export interface CosmeticVendorProductDefinition {
  id: string;
  category: CosmeticVendorCategory;
  name: string;
  description: string;
  goldPrice: number;
  cosmeticKeys: readonly string[];
  sortOrder: number;
}

export const COSMETIC_VENDOR_PRODUCTS = Object.freeze([
  {
    id: 'gold-avatar-vigia-oficina',
    category: 'avatar',
    name: 'Vigia da Oficina',
    description: 'Retrato masculino de um sobrevivente da manutenção.',
    goldPrice: 900,
    cosmeticKeys: ['avatar-acervo-vigia-oficina'],
    sortOrder: 10,
  },
  {
    id: 'gold-avatar-batedora-patio',
    category: 'avatar',
    name: 'Batedora do Pátio',
    description: 'Retrato feminino de uma batedora do abrigo.',
    goldPrice: 1_050,
    cosmeticKeys: ['avatar-acervo-batedora-patio'],
    sortOrder: 20,
  },
  {
    id: 'gold-frame-chapa-rebitada',
    category: 'frame',
    name: 'Chapa Rebitada',
    description: 'Moldura de metal reaproveitado com cantos reforçados.',
    goldPrice: 550,
    cosmeticKeys: ['moldura-acervo-chapa-rebitada'],
    sortOrder: 10,
  },
  {
    id: 'gold-frame-lona-marcada',
    category: 'frame',
    name: 'Lona Marcada',
    description: 'Acabamento de lona costurada usado no inventário.',
    goldPrice: 650,
    cosmeticKeys: ['moldura-acervo-lona-marcada'],
    sortOrder: 20,
  },
  {
    id: 'gold-card-bancada-manutencao',
    category: 'card',
    name: 'Bancada de Manutenção',
    description: 'Uma bancada simples e funcional para o cartão público.',
    goldPrice: 700,
    cosmeticKeys: ['banner-acervo-bancada-manutencao'],
    sortOrder: 10,
  },
  {
    id: 'gold-card-corredor-almoxarifado',
    category: 'card',
    name: 'Corredor do Almoxarifado',
    description: 'O corredor de suprimentos aplicado ao cartão público.',
    goldPrice: 800,
    cosmeticKeys: ['banner-acervo-corredor-almoxarifado'],
    sortOrder: 20,
  },
  {
    id: 'gold-overview-oficina-abrigo',
    category: 'overview',
    name: 'Oficina do Abrigo',
    description: 'Garagem de manutenção aplicada à visão geral.',
    goldPrice: 1_250,
    cosmeticKeys: ['fundo-acervo-oficina-abrigo'],
    sortOrder: 10,
  },
  {
    id: 'gold-overview-patio-triagem',
    category: 'overview',
    name: 'Pátio de Triagem',
    description: 'Área de separação de suprimentos para a visão geral.',
    goldPrice: 1_400,
    cosmeticKeys: ['fundo-acervo-patio-triagem'],
    sortOrder: 20,
  },
  {
    id: 'gold-effect-poeira-oficina',
    category: 'effect',
    name: 'Poeira de Oficina',
    description: 'Partículas discretas atravessam o cartão do personagem.',
    goldPrice: 650,
    cosmeticKeys: ['efeito-acervo-poeira-oficina'],
    sortOrder: 10,
  },
  {
    id: 'gold-effect-pulso-lanterna',
    category: 'effect',
    name: 'Pulso de Lanterna',
    description: 'Um facho suave percorre o perfil em intervalos regulares.',
    goldPrice: 750,
    cosmeticKeys: ['efeito-acervo-pulso-lanterna'],
    sortOrder: 20,
  },
  {
    id: 'gold-identity-mao-na-massa',
    category: 'identity',
    name: 'Mão na Massa',
    description: 'Título e distintivo para quem mantém o abrigo funcionando.',
    goldPrice: 450,
    cosmeticKeys: ['titulo-acervo-mao-na-massa', 'distintivo-acervo-mm'],
    sortOrder: 10,
  },
  {
    id: 'gold-identity-olho-vigia',
    category: 'identity',
    name: 'Olho de Vigia',
    description: 'Título e distintivo para quem protege o perímetro.',
    goldPrice: 550,
    cosmeticKeys: ['titulo-acervo-olho-vigia', 'distintivo-acervo-ov'],
    sortOrder: 20,
  },
] satisfies readonly CosmeticVendorProductDefinition[]);

export function getCosmeticVendorProduct(productId: string) {
  return COSMETIC_VENDOR_PRODUCTS.find((product) => product.id === productId);
}

export const COSMETIC_VENDOR_COSMETIC_KEYS = Object.freeze(
  Array.from(
    new Set(
      COSMETIC_VENDOR_PRODUCTS.flatMap((product) => product.cosmeticKeys),
    ),
  ),
);
