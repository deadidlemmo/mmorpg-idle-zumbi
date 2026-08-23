export const STOREFRONT_PROVIDER_KEYS = ['MERCADO_PAGO', 'STRIPE'] as const;

export type StorefrontProviderKey = (typeof STOREFRONT_PROVIDER_KEYS)[number];

export const STOREFRONT_OFFER_KEYS = [
  'premium-abrigo-monthly',
  'pacote-nucleo-helix',
  'pacote-protocolo-carmesim',
] as const;

export type StorefrontOfferKey = (typeof STOREFRONT_OFFER_KEYS)[number];
export type StorefrontOfferKind = 'SUBSCRIPTION' | 'PERMANENT_PACKAGE';

export interface StorefrontOfferDefinition {
  key: StorefrontOfferKey;
  kind: StorefrontOfferKind;
  name: string;
  eyebrow: string;
  description: string;
  collectionKey: string;
  billingLabel: string;
  accentColor: string;
  benefits: readonly string[];
}

export const STOREFRONT_OFFERS: readonly StorefrontOfferDefinition[] = [
  {
    key: 'premium-abrigo-monthly',
    kind: 'SUBSCRIPTION',
    name: 'Premium do Abrigo',
    eyebrow: 'Assinatura',
    description:
      'Benefícios de progressão e a coleção Último Abrigo enquanto a assinatura estiver ativa.',
    collectionKey: 'premium-ultimo-abrigo',
    billingLabel: 'Renovação mensal',
    accentColor: '#8bd35c',
    benefits: [
      '+20% de EXP em gathering, batalha e caça',
      'Até 12 horas de progresso idle',
      'Coleção completa Último Abrigo',
      'Benefícios válidos para toda a conta',
    ],
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
    benefits: [
      '8 avatares para cada classe',
      'Moldura, cartão e fundo de visão geral',
      'Efeito, título e distintivo exclusivos',
      'Desbloqueio permanente para a conta',
    ],
  },
] as const;

export const STOREFRONT_PROVIDERS = [
  {
    key: 'MERCADO_PAGO' as const,
    name: 'Mercado Pago',
    state: 'PLANNED' as const,
  },
  {
    key: 'STRIPE' as const,
    name: 'Stripe',
    state: 'PLANNED' as const,
  },
] as const;
