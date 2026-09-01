export const STOREFRONT_PROVIDER_KEYS = ['MERCADO_PAGO', 'STRIPE'] as const;

export type StorefrontProviderKey = (typeof STOREFRONT_PROVIDER_KEYS)[number];

export const STOREFRONT_OFFER_KEYS = [
  'premium-abrigo-monthly',
  'premium-abrigo-30d-item',
  'cash-custom',
  'cash-25',
  'cash-50',
  'cash-100',
  'cash-200',
  'pacote-nucleo-helix',
  'pacote-protocolo-carmesim',
] as const;

export type StorefrontOfferKey = (typeof STOREFRONT_OFFER_KEYS)[number];
export type StorefrontOfferKind =
  | 'SUBSCRIPTION'
  | 'PREMIUM_ITEM'
  | 'CASH_PACKAGE'
  | 'PERMANENT_PACKAGE';

export interface StorefrontOfferDefinition {
  key: StorefrontOfferKey;
  kind: StorefrontOfferKind;
  name: string;
  eyebrow: string;
  description: string;
  collectionKey?: string;
  billingLabel: string;
  accentColor: string;
  benefits: readonly string[];
  priceCents: number;
  cashAmount?: number;
  customQuantity?: {
    min: number;
    max: number;
    unitPriceCents: number;
  };
  premiumDays?: number;
  itemSlug?: string;
  tradeable?: boolean;
}

export const PREMIUM_PASS_ITEM_SLUG = 'passe-premium-30-dias';
export const CASH_UNIT_PRICE_CENTS = 100;
export const CUSTOM_CASH_MIN_AMOUNT = 1;
export const CUSTOM_CASH_MAX_AMOUNT = 1_000;

export const PREMIUM_CORE_BENEFITS = [
  '+20% de EXP de Personagem',
  '+20% de EXP de Rastreio',
  '+20% de EXP de Expedições',
  '+20% de EXP de Criação',
  'Até 12 horas de progresso idle',
  'Coleção Último Abrigo enquanto Premium estiver ativo',
  'Benefícios válidos para toda a conta',
] as const;

export const STOREFRONT_OFFERS: readonly StorefrontOfferDefinition[] = [
  {
    key: 'premium-abrigo-monthly',
    kind: 'SUBSCRIPTION',
    name: 'Premium do Abrigo',
    eyebrow: 'Assinatura',
    description: 'Premium ativo em toda a conta com renovação mensal.',
    collectionKey: 'premium-ultimo-abrigo',
    billingLabel: 'por mês',
    accentColor: '#8bd35c',
    priceCents: 1990,
    premiumDays: 30,
    tradeable: false,
    benefits: PREMIUM_CORE_BENEFITS,
  },
  {
    key: 'premium-abrigo-30d-item',
    kind: 'PREMIUM_ITEM',
    name: 'Passe Premium de 30 dias',
    eyebrow: 'Item de ativação',
    description: 'Item que concede 30 dias de Premium quando utilizado.',
    billingLabel: 'pagamento único',
    accentColor: '#e1bd55',
    priceCents: 1990,
    premiumDays: 30,
    itemSlug: PREMIUM_PASS_ITEM_SLUG,
    tradeable: true,
    benefits: PREMIUM_CORE_BENEFITS,
  },
  {
    key: 'cash-custom',
    kind: 'CASH_PACKAGE',
    name: 'Cash sob medida',
    eyebrow: 'Escolha a quantidade',
    description: 'Compre exatamente a quantidade de Cash que desejar.',
    billingLabel: 'R$ 1,00 por Cash',
    accentColor: '#78a9dc',
    priceCents: CASH_UNIT_PRICE_CENTS,
    cashAmount: 1,
    customQuantity: {
      min: CUSTOM_CASH_MIN_AMOUNT,
      max: CUSTOM_CASH_MAX_AMOUNT,
      unitPriceCents: CASH_UNIT_PRICE_CENTS,
    },
    benefits: [],
  },
  {
    key: 'cash-25',
    kind: 'CASH_PACKAGE',
    name: '25 Cash',
    eyebrow: 'Pacote de entrada',
    description: '25 Cash pelo valor padrão.',
    billingLabel: 'R$ 1,00 por Cash',
    accentColor: '#78a9dc',
    priceCents: 2_500,
    cashAmount: 25,
    benefits: [],
  },
  {
    key: 'cash-50',
    kind: 'CASH_PACKAGE',
    name: '55 Cash',
    eyebrow: '10% de bônus',
    description: '50 Cash + 5 Cash de bônus.',
    billingLabel: 'R$ 0,91 por Cash',
    accentColor: '#6fc6bb',
    priceCents: 5_000,
    cashAmount: 55,
    benefits: [],
  },
  {
    key: 'cash-100',
    kind: 'CASH_PACKAGE',
    name: '115 Cash',
    eyebrow: '15% de bônus',
    description: '100 Cash + 15 Cash de bônus.',
    billingLabel: 'R$ 0,87 por Cash',
    accentColor: '#88d0d8',
    priceCents: 10_000,
    cashAmount: 115,
    benefits: [],
  },
  {
    key: 'cash-200',
    kind: 'CASH_PACKAGE',
    name: '240 Cash',
    eyebrow: '20% de bônus',
    description: '200 Cash + 40 Cash de bônus.',
    billingLabel: 'R$ 0,83 por Cash',
    accentColor: '#e1bd55',
    priceCents: 20_000,
    cashAmount: 240,
    benefits: [],
  },
  {
    key: 'pacote-nucleo-helix',
    kind: 'PERMANENT_PACKAGE',
    name: 'Núcleo Helix',
    eyebrow: 'Pacote cosmético',
    description:
      'Biotecnologia ciano-violeta, retratos por classe e identidade visual completa.',
    collectionKey: 'premium-nucleo-helix',
    billingLabel: 'Pagamento único',
    accentColor: '#65d8e8',
    priceCents: 1990,
    tradeable: true,
    benefits: [
      '8 avatares para cada classe',
      'Moldura, cartão e fundo de visão geral',
      'Efeito, título e distintivo exclusivos',
      'Desbloqueio permanente para a conta',
    ],
  },
  {
    key: 'pacote-protocolo-carmesim',
    kind: 'PERMANENT_PACKAGE',
    name: 'Protocolo Carmesim',
    eyebrow: 'Pacote cosmético',
    description:
      'Comando blindado em grafite e vermelho, com identidade visual completa.',
    collectionKey: 'premium-protocolo-carmesim',
    billingLabel: 'Pagamento único',
    accentColor: '#ef5a56',
    priceCents: 1990,
    tradeable: true,
    benefits: [
      '8 avatares para cada classe',
      'Moldura, cartão e fundo de visão geral',
      'Efeito, título e distintivo exclusivos',
      'Desbloqueio permanente para a conta',
    ],
  },
] as const;

export const STOREFRONT_PROVIDER_DEFINITIONS = [
  {
    key: 'MERCADO_PAGO' as const,
    name: 'Mercado Pago',
  },
  {
    key: 'STRIPE' as const,
    name: 'Stripe',
  },
] as const;
