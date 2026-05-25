import maraPortrait from '../../../assets/images/npcs/npc_coleta_dona_celia.png';

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
    marketName: 'Balcao da Mara',
    npcName: 'Mara',
    role: 'Mercadora geral',
    title: 'Mara, a Mercadora',
    quote: 'Suprimentos, remédios e recursos para quem ainda sobrevive.',
    description:
      'Banca de suprimentos para compras rapidas dentro do abrigo.',
    shopDescription:
      'Compre consumiveis e suprimentos com Gold para sustentar suas cacadas e expedicoes.',
    portraitUrl: maraPortrait,
    initials: 'MA',
    tags: [
      { label: 'Suprimentos', tone: 'gold' },
      { label: 'Consumiveis', tone: 'muted' },
      { label: 'Itens', tone: 'green' },
    ],
    available: true,
  },
];

export function getMerchantByRouteSegment(routeSegment?: string | null) {
  return MERCHANTS.find((merchant) => merchant.routeSegment === routeSegment);
}
