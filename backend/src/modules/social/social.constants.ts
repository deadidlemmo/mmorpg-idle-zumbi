import { MaterialOrigin } from '@prisma/client';

export const SOCIAL_RANKING_CATEGORIES = [
  'LEVEL',
  'HUNTING',
  'CRAFTING',
  'DESMANCHE',
  'COLETA',
  'CONTENCAO',
  'ARSENAL',
  'PATRULHA',
  'TECNOVARREDURA',
] as const;

export type SocialRankingCategory = (typeof SOCIAL_RANKING_CATEGORIES)[number];

export const GATHERING_RANKING_ORIGINS: Readonly<
  Partial<Record<SocialRankingCategory, MaterialOrigin>>
> = {
  DESMANCHE: MaterialOrigin.DESMANCHE,
  COLETA: MaterialOrigin.COLETA,
  CONTENCAO: MaterialOrigin.CONTENCAO,
  ARSENAL: MaterialOrigin.ARSENAL,
  PATRULHA: MaterialOrigin.PATRULHA,
  TECNOVARREDURA: MaterialOrigin.TECNOVARREDURA,
};

export const SOCIAL_RANKING_LABELS: Readonly<
  Record<SocialRankingCategory, string>
> = {
  LEVEL: 'Nível geral',
  HUNTING: 'Caça',
  CRAFTING: 'Criação',
  DESMANCHE: 'Desmanche',
  COLETA: 'Coleta',
  CONTENCAO: 'Contenção',
  ARSENAL: 'Arsenal',
  PATRULHA: 'Patrulha',
  TECNOVARREDURA: 'Tecnovarredura',
};
