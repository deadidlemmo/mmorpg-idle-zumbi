export const MATERIAL_IMAGE_SLUG_ALIASES = {
  // T1 legacy materials.
  'jaqueta-de-couro-rasgada': 'suprimento-de-rua',
  'lente-de-mira-quebrada': 'componente-gasto',
  'moletom-reforcado': 'suprimento-basico',
  'seringa-pneumatica-quebrada': 'circuito-fragil',
  'talas-de-madeira-partida': 'sucata-leve',
  'tampa-metalica-amassada': 'sucata-oxidada',

  // T2 legacy materials.
  'macacao-de-oficina-cortado': 'suprimento-de-oficina',
  'macacao-de-oficina-escuro': 'suprimento-ferruginoso',
  'painel-de-lataria-curvado': 'sucata-rebitada',
  'painel-de-portao-oxidado': 'sucata-industrial',
  'pistao-pneumatico-oxidado': 'circuito-oxidado',
  'reticulo-oxidado': 'componente-rebitado',

  // T3 legacy materials.
  'avental-clinico-escuro': 'suprimento-medico',
  'avental-de-resgate-grosso': 'suprimento-esterilizado',
  'estrutura-de-maca-dobravel': 'sucata-reforcada',
  'sensor-de-pulso-rachado': 'componente-clinico',
  'tala-metalica-hospitalar': 'sucata-selada',
  'valvula-hipodermica-clinica': 'circuito-clinico',

  // T4 legacy materials.
  'degrau-de-escada-rolante': 'sucata-militar',
  'jaqueta-de-passageiro-gasta': 'suprimento-de-terminal',
  'jaqueta-de-passageiro-reforcada': 'suprimento-tatico',
  'lente-de-seguranca-do-terminal': 'componente-de-embarque',
  'modulo-de-maleta-dea': 'circuito-de-terminal',
  'painel-de-embarque-quebrado': 'sucata-blindada',

  // T5 legacy materials.
  'colete-sanitario-escuro': 'suprimento-de-quarentena',
  'colete-sanitario-rasgado': 'suprimento-selado',
  'painel-de-barreira-verde': 'sucata-quarentenada',
  'pistao-de-dose-sanitaria': 'circuito-quarentenado',
  'reticulo-sanitario-verde': 'componente-quarentenado',
} as const satisfies Readonly<Record<string, string>>;

export function resolveMaterialImageSlug(slug: string): string {
  return MATERIAL_IMAGE_SLUG_ALIASES[
    slug as keyof typeof MATERIAL_IMAGE_SLUG_ALIASES
  ] ?? slug;
}
