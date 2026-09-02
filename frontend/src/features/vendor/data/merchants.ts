import maraPortrait from '../../../assets/images/npcs/npc_mercadora_mara.webp';
import veraPortrait from '../../../assets/images/npcs/npc_curadora_vera.webp';

export interface MerchantOffer {
  label: string;
  description: string;
  icon: "POTION" | "APPEARANCE";
}

export interface MerchantDefinition {
  id: string;
  routeSegment: string;
  shopType: "SUPPLIES" | "COSMETICS";
  tone: "supply" | "identity";
  marketName: string;
  npcName: string;
  role: string;
  title: string;
  quote: string;
  description: string;
  shopDescription: string;
  portraitUrl: string;
  initials: string;
  offers: MerchantOffer[];
  available: boolean;
}

export const MERCHANTS: MerchantDefinition[] = [
  {
    id: 'mara',
    routeSegment: 'mara',
    shopType: 'SUPPLIES',
    tone: 'supply',
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
    offers: [
      {
        label: 'Poções',
        description: 'Cura e recuperação',
        icon: 'POTION',
      },
    ],
    available: true,
  },
  {
    id: 'vera',
    routeSegment: 'vera',
    shopType: 'COSMETICS',
    tone: 'identity',
    marketName: 'Ateliê da Vera',
    npcName: 'Vera',
    role: 'Curadora de identidade',
    title: 'Vera, a Curadora',
    quote: 'Sobreviver mantém você de pé. Sua identidade mostra quem ficou.',
    description:
      'Arquivo visual do abrigo para personalizar a identidade dos sobreviventes.',
    shopDescription:
      'Encontre avatares, molduras, cartões, cenários, efeitos e itens de identidade por Gold.',
    portraitUrl: veraPortrait,
    initials: 'VE',
    offers: [
      {
        label: 'Aparência',
        description: 'Avatares, molduras e efeitos',
        icon: 'APPEARANCE',
      },
    ],
    available: true,
  },
];

export function getMerchantByRouteSegment(routeSegment?: string | null) {
  return MERCHANTS.find((merchant) => merchant.routeSegment === routeSegment);
}
