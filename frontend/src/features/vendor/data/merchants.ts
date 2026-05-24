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
    quote: 'Compra, venda e troca de suprimentos para quem ainda sobrevive.',
    description:
      'Pocoes, consumiveis e uma banca preparada para negociar excedentes do abrigo.',
    shopDescription:
      'Compre pocoes com Gold, venda materiais excedentes e mantenha o abrigo girando sem sair do dashboard.',
    portraitUrl: maraPortrait,
    initials: 'MA',
    tags: [
      { label: 'Pocoes', tone: 'gold' },
      { label: 'Consumiveis', tone: 'green' },
      { label: 'Compra materiais', tone: 'muted' },
    ],
    available: true,
  },
];

export function getMerchantByRouteSegment(routeSegment?: string | null) {
  return MERCHANTS.find((merchant) => merchant.routeSegment === routeSegment);
}
