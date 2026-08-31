export const STOREFRONT_PROVIDER_KEYS = ['MERCADO_PAGO', 'STRIPE'] as const;

export type StorefrontProviderKey = (typeof STOREFRONT_PROVIDER_KEYS)[number];

export const STOREFRONT_OFFER_KEYS = [
  'premium-abrigo-monthly',
  'premium-abrigo-30d-item',
  'cash-100',
  'cash-200',
  'cash-500',
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
  premiumDays?: number;
  itemSlug?: string;
  tradeable?: boolean;
}

export const PREMIUM_PASS_ITEM_SLUG = 'passe-premium-30-dias';

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
    key: 'cash-100',
    kind: 'CASH_PACKAGE',
    name: '100 Cash',
    eyebrow: 'Recarga essencial',
    description: 'Para uma compra pontual no catálogo.',
    billingLabel: 'pagamento único',
    accentColor: '#78a9dc',
    priceCents: 990,
    cashAmount: 100,
    benefits: [],
  },
  {
    key: 'cash-200',
    kind: 'CASH_PACKAGE',
    name: '200 Cash',
    eyebrow: 'Mais escolhido',
    description: 'Economia de R$ 1,90 em relação ao pacote de 100.',
    billingLabel: 'pagamento único',
    accentColor: '#88d0d8',
    priceCents: 1790,
    cashAmount: 200,
    benefits: [],
  },
  {
    key: 'cash-500',
    kind: 'CASH_PACKAGE',
    name: '500 Cash',
    eyebrow: 'Melhor valor',
    description: 'Economia de R$ 9,60 em relação ao pacote de 100.',
    billingLabel: 'pagamento único',
    accentColor: '#e1bd55',
    priceCents: 1990,
    cashAmount: 500,
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
