import maraPortrait from '../../../assets/images/npcs/npc_mercadora_mara.webp';

export type MerchantTagTone = 'gold' | 'green' | 'muted';

export interface MerchantTag {
  label: string;
  tone?: MerchantTagTone;
}

export interface MerchantDefinition {
  id: string;
  routeSegment: string;
  marketName: string;
  npcName: string;
  role: string;
  title: string;
  quote: string;
  description: string;
  shopDescription: string;
  portraitUrl: string;
  initials: string;
  tags: MerchantTag[];
  available: boolean;
}

export const MERCHANTS: MerchantDefinition[] = [
  {
    id: 'mara',
    routeSegment: 'mara',
    marketName: 'Balcão da Mara',
    npcName: 'Mara',
    role: 'Mercadora geral',
    title: 'Mara, a Mercadora',
    quote: 'Suprimentos, remédios e recursos para quem ainda sobrevive.',
    description:
      'Banca de suprimentos para compras rápidas dentro do abrigo.',
    shopDescription:
      'Compre consumíveis e suprimentos com Gold para sustentar suas caçadas e expedições.',
    portraitUrl: maraPortrait,
    initials: 'MA',
    tags: [{ label: 'Poções', tone: 'gold' }],
    available: true,
  },
];

export function getMerchantByRouteSegment(routeSegment?: string | null) {
  return MERCHANTS.find((merchant) => merchant.routeSegment === routeSegment);
}
