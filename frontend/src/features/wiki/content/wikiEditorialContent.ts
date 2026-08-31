export interface WikiEditorialLink {
  label: string;
  to: string;
}

export interface WikiEditorialSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  links?: WikiEditorialLink[];
}

export interface WikiEditorialPage {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  keywords: string[];
  sections: WikiEditorialSection[];
  related: WikiEditorialLink[];
}

export const WIKI_PET_BONUSES = [
  {
    key: "DESMANCHE",
    label: "Desmanche",
    description: "Expedição mais rápida",
  },
  {
    key: "COLETA",
    label: "Coleta",
    description: "Expedição mais rápida",
  },
  {
    key: "PATRULHA",
    label: "Patrulha",
    description: "Expedição mais rápida",
  },
  {
    key: "ARSENAL",
    label: "Arsenal",
    description: "Expedição mais rápida",
  },
  {
    key: "TECNOVARREDURA",
    label: "Tecnovarredura",
    description: "Expedição mais rápida",
  },
  {
    key: "CONTENCAO",
    label: "Contenção",
    description: "Expedição mais rápida",
  },
  {
    key: "AUTO_COMBAT",
    label: "Combate automático",
    description: "Derrota monstros mais rápido",
  },
  {
    key: "HUNTING",
    label: "Rastreamento",
    description: "Encontra ameaças mais rápido",
  },
] as const;

export const WIKI_PET_TIER_BONUSES = [
  { tier: 1, percent: 3 },
  { tier: 2, percent: 4 },
  { tier: 3, percent: 5 },
  { tier: 4, percent: 6 },
  { tier: 5, percent: 7.5 },
] as const;

export const GETTING_STARTED_PAGE: WikiEditorialPage = {
  slug: "getting-started",
  title: "Começando no Dead Idle",
  eyebrow: "Guia do iniciante",
  summary:
    "Uma sequência curta para sair do abrigo, conseguir recursos e preparar os primeiros equipamentos.",
  keywords: ["começar", "iniciante", "primeiros passos", "o que fazer"],
  sections: [
    {
      title: "1. Conheça o abrigo",
      paragraphs: [
        "A Visão geral reúne seu nível, vida, equipamentos e atividade atual. O menu lateral leva aos sistemas do personagem e às atividades do mundo.",
      ],
    },
    {
      title: "2. Confira o mapa",
      paragraphs: [
        "Mapas mostram a faixa de nível de cada região. Viajar define onde suas expedições, caçadas, incursões e ameaças disponíveis serão consultadas.",
      ],
      links: [{ label: "Ver mapas e áreas", to: "/wiki/maps" }],
    },
    {
      title: "3. Colete recursos",
      paragraphs: [
        "Escolha uma origem em Expedições e inicie a coleta. Os materiais obtidos vão para a mochila.",
      ],
      links: [
        {
          label: "Como funcionam as Expedições",
          to: "/wiki/systems/expedicoes",
        },
        { label: "Catálogo de recursos", to: "/wiki/resources" },
      ],
    },
    {
      title: "4. Fabrique e equipe",
      paragraphs: [
        "Criação mostra receitas reais e os ingredientes necessários. Depois que a produção terminar, abra Equipamentos para substituir as peças iniciais.",
      ],
      links: [
        { label: "Entender Criação", to: "/wiki/systems/criacao" },
        {
          label: "Entender Equipamentos",
          to: "/wiki/systems/equipamentos-e-reforco",
        },
      ],
    },
    {
      title: "5. Inicie uma caça",
      paragraphs: [
        "No Combate automático, escolha uma área, rastreie ameaças e selecione um alvo. A luta continua sozinha enquanto houver vida e recursos.",
      ],
      links: [
        {
          label: "Guia de Combate automático",
          to: "/wiki/systems/combate-automatico",
        },
        { label: "Consultar monstros", to: "/wiki/monsters" },
      ],
    },
    {
      title: "Quando a progressão travar",
      bullets: [
        "Confira se seu equipamento acompanha o tier do mapa.",
        "Use a Wiki do item para descobrir onde ele cai ou em quais receitas é usado.",
        "Veja Objetivos para missões e conquistas disponíveis.",
        "Retorne a uma área anterior se o consumo de poções ou o risco estiver alto.",
      ],
    },
  ],
  related: [
    { label: "Progressão", to: "/wiki/progression" },
    { label: "Combate", to: "/wiki/combat" },
    { label: "Todos os sistemas", to: "/wiki/systems" },
  ],
};

export const WIKI_SYSTEM_PAGES: WikiEditorialPage[] = [
  {
    slug: "combate-automatico",
    title: "Combate automático",
    eyebrow: "Atividade",
    summary: "Encontra ameaças e mantém seu sobrevivente lutando sozinho.",
    keywords: ["auto combate", "caça", "hunting", "matar", "offline"],
    sections: [
      {
        title: "Antes de iniciar",
        bullets: [
          "Escolha um alvo compatível com seu nível e equipamentos.",
          "Configure a poção adequada antes de uma sessão longa.",
          "Encerre outra atividade principal que ainda esteja em andamento.",
        ],
      },
      {
        title: "Quando a sessão para",
        paragraphs: [
          "A sessão termina se você encerrar a atividade ou for derrotado. O limite ocioso é de 6 horas em contas gratuitas e 12 horas no Premium.",
        ],
      },
    ],
    related: [
      { label: "Regras de combate", to: "/wiki/combat" },
      { label: "Bestiário", to: "/wiki/monsters" },
      { label: "Poções", to: "/wiki/systems/pocoes" },
    ],
  },
  {
    slug: "expedicoes",
    title: "Expedições",
    eyebrow: "Atividade",
    summary:
      "Coleta materiais por origem, desenvolve proficiência e abastece receitas de Criação.",
    keywords: ["gathering", "coleta", "material", "recurso", "desmanche"],
    sections: [
      {
        title: "Como coletar",
        paragraphs: [
          "Escolha uma Expedição e depois um recurso liberado para sua proficiência no mapa atual. Cada uma das seis especializações evolui separadamente.",
        ],
      },
      {
        title: "Enquanto estiver fora",
        paragraphs: [
          "A coleta continua fora da página. Ao retornar, quantidade, XP e nível da Expedição são reconciliados pelo jogo.",
        ],
      },
    ],
    related: [
      { label: "Recursos", to: "/wiki/resources" },
      { label: "Criação", to: "/wiki/systems/criacao" },
      { label: "Mapas", to: "/wiki/maps" },
    ],
  },
  {
    slug: "criacao",
    title: "Criação",
    eyebrow: "Atividade",
    summary: "Transforma materiais da mochila em equipamentos e outros itens.",
    keywords: ["crafting", "fabricar", "receita", "ingrediente", "equipamento"],
    sections: [
      {
        title: "Antes de produzir",
        bullets: [
          "Confira resultado, tier, quantidade, duração e ingredientes.",
          "Ingredientes são consumidos ao iniciar, não ao concluir.",
        ],
      },
      {
        title: "Proficiência de Criação",
        paragraphs: [
          "Os níveis 1–10 liberam receitas T1. A cada 10 níveis, o próximo tier é liberado, até o nível 100.",
        ],
      },
    ],
    related: [
      { label: "Itens fabricáveis", to: "/wiki/items" },
      { label: "Expedições", to: "/wiki/systems/expedicoes" },
      { label: "Equipamentos", to: "/wiki/systems/equipamentos-e-reforco" },
    ],
  },
  {
    slug: "mochila-e-banco",
    title: "Mochila e banco",
    eyebrow: "Personagem",
    summary:
      "Armazena equipamentos, materiais e consumíveis e separa o que está disponível do estoque guardado.",
    keywords: ["inventário", "inventario", "mochila", "banco", "guardar"],
    sections: [
      {
        title: "Mochila",
        paragraphs: [
          "Itens de coleta, combate, criação, incursões, bosses e compras chegam à mochila. É dali que você equipa, usa, troca ou anuncia cada item.",
        ],
      },
      {
        title: "Banco",
        paragraphs: [
          "Depósitos e retiradas movem quantidades entre mochila e banco. Itens guardados não ficam disponíveis para ações que exigem a mochila até serem retirados.",
        ],
      },
      {
        title: "Ações do item",
        bullets: [
          "Equipamentos podem ser equipados quando classe, tier, slot e requisitos permitem.",
          "Materiais especiais podem oferecer trocas específicas diretamente pela mochila.",
          "Somente itens permitidos podem ser vendidos a NPCs ou anunciados no Mercado do Abrigo.",
        ],
      },
    ],
    related: [
      { label: "Catálogo de itens", to: "/wiki/items" },
      { label: "Mercado do Abrigo", to: "/wiki/systems/mercado-do-abrigo" },
    ],
  },
  {
    slug: "equipamentos-e-reforco",
    title: "Equipamentos e reforço",
    eyebrow: "Personagem",
    summary:
      "Compare seus equipamentos, equipe a melhor peça e fortaleça cada item até +3.",
    keywords: [
      "arma",
      "armadura",
      "equipar",
      "reforçar",
      "upgrade",
      "item melhor",
      "fragmento de reforço",
      "incursão",
    ],
    sections: [
      {
        title: "Como escolher uma peça melhor",
        bullets: [
          "Procure uma peça da sua classe, do seu tier e do slot correto.",
          "Abra Equipamentos, escolha o slot e compare a peça equipada com as peças da mochila.",
          "Se a nova peça melhorar os atributos que sua classe usa, equipe-a.",
        ],
      },
      {
        title: "Onde conseguir equipamento melhor",
        bullets: [
          "Faça Expedições e derrote monstros para reunir os materiais pedidos pela receita.",
          "Abra Criação, filtre pela sua classe e pelo tier e fabrique a peça.",
          "Você também pode comprar equipamentos de outros jogadores no Mercado do Abrigo.",
        ],
      },
      {
        title: "Como reforçar",
        paragraphs: [
          "Faça Incursões para conseguir Fragmentos de Reforço. Depois abra Equipamentos, escolha o slot da peça equipada e clique em Reforçar.",
          "A peça usa fragmentos do mesmo tier mais Gold. O reforço vai até +3 e não falha.",
        ],
      },
    ],
    related: [
      { label: "Equipamentos no catálogo", to: "/wiki/items" },
      { label: "Criação", to: "/wiki/systems/criacao" },
      { label: "Incursões", to: "/wiki/systems/incursoes" },
      { label: "Mercado do Abrigo", to: "/wiki/systems/mercado-do-abrigo" },
    ],
  },
  {
    slug: "pocoes",
    title: "Poções",
    eyebrow: "Consumíveis",
    summary:
      "Recuperam vida manualmente ou durante o combate automático conforme a configuração do personagem.",
    keywords: ["poção", "pocao", "cura", "vida", "consumível"],
    sections: [
      {
        title: "Uso",
        bullets: [
          "Cada poção define cura fixa, cura percentual e onde pode ser usada.",
          "No combate automático, cada uso desconta uma unidade da mochila.",
          "A configuração automática pertence ao personagem e aponta para um item de poção específico.",
        ],
      },
      {
        title: "Escolha por tier",
        paragraphs: [
          "Poções possuem faixas de tier. A página do item informa cura, requisitos e onde o consumível pode ser adquirido.",
        ],
      },
    ],
    related: [
      { label: "Consumíveis", to: "/wiki/items?slot=CONSUMABLE" },
      { label: "Mercador", to: "/wiki/systems/mercador" },
      { label: "Combate automático", to: "/wiki/systems/combate-automatico" },
    ],
  },
  {
    slug: "enfermaria",
    title: "Enfermaria",
    eyebrow: "Abrigo",
    summary:
      "Recupera sobreviventes feridos por tratamento gratuito com espera ou atendimento particular em Gold.",
    keywords: ["hospital", "cura", "morte", "recuperar", "médico"],
    sections: [
      {
        title: "Tratamento gratuito",
        paragraphs: [
          "O atendimento gratuito dura 30 minutos. O personagem permanece em observação e precisa reivindicar a alta quando o tempo terminar.",
        ],
      },
      {
        title: "Atendimento particular",
        paragraphs: [
          "A recuperação imediata custa Gold. O preço depende do nível e da vida ausente e aparece antes da confirmação.",
        ],
      },
      {
        title: "Limitações",
        paragraphs: [
          "Durante o tratamento, o personagem não pode iniciar outra atividade principal.",
        ],
      },
    ],
    related: [
      { label: "Poções", to: "/wiki/systems/pocoes" },
      { label: "Combate", to: "/wiki/combat" },
    ],
  },
  {
    slug: "incursoes",
    title: "Incursões",
    eyebrow: "Atividade",
    summary:
      "Missões com tempo, custo de entrada, risco e recompensas próprias.",
    keywords: ["incursão", "incursao", "ficha", "risco", "recompensa"],
    sections: [
      {
        title: "Antes de confirmar",
        bullets: [
          "Confira mapa, nível, duração, custo em Gold e recompensas.",
          "Escolha a abordagem conforme seu risco: Cautelosa, Equilibrada ou Agressiva.",
        ],
      },
      {
        title: "Resultado",
        paragraphs: [
          "O resultado é resolvido uma vez. Sucesso ou falha, vida perdida e recompensas reaparecem corretamente após atualizar a página.",
        ],
      },
    ],
    related: [
      { label: "Mapas com incursões", to: "/wiki/maps" },
      { label: "Itens de incursão", to: "/wiki/items?search=incursao" },
    ],
  },
  {
    slug: "ameacas-globais",
    title: "Ameaças Globais",
    eyebrow: "Atividade coletiva",
    summary:
      "Bosses coletivos com horário marcado, inscrição antecipada e recompensas especiais.",
    keywords: ["boss", "chefe", "ameaça", "global", "casulo", "fragmento"],
    sections: [
      {
        title: "Quem pode participar",
        paragraphs: [
          "Você precisa estar no mapa e no nível do boss. A inscrição não interrompe sua atividade; ela só é encerrada quando a batalha começa.",
        ],
      },
      {
        title: "Recompensas",
        paragraphs: [
          "Vitórias elegíveis podem entregar XP, Gold, Fragmentos de Ameaça e casulos. A tela de cada boss mostra os valores e a chance do casulo.",
        ],
      },
    ],
    related: [
      { label: "Catálogo de bosses", to: "/wiki/bosses" },
      { label: "Pets", to: "/wiki/systems/pets" },
      { label: "Fragmentos", to: "/wiki/items?search=fragmento%20de%20ameaca" },
    ],
  },
  {
    slug: "pets",
    title: "Pets",
    eyebrow: "Personagem",
    summary:
      "Consiga um casulo em Ameaças Globais, incube-o e equipe o pet para receber seu bônus.",
    keywords: ["pet", "companheiro", "casulo", "ovo", "incubar", "fragmento"],
    sections: [
      {
        title: "Como conseguir um pet",
        bullets: [
          "Participe de uma Ameaça Global liberada para seu nível e mapa.",
          "Ao vencer, você recebe Fragmentos de Ameaça e pode ganhar um casulo.",
          "Abra Pets, escolha o casulo e inicie a incubação usando fragmentos do mesmo tier mais Gold.",
          "Quando o tempo acabar, resgate o pet e equipe-o.",
        ],
      },
      {
        title: "Como o bônus funciona",
        paragraphs: [
          "O tipo do casulo define qual atividade o pet acelera. O tier define a força do bônus, e somente o pet equipado aplica esse efeito.",
        ],
      },
      {
        title: "Trocas",
        paragraphs: [
          "Casulos e Fragmentos de Ameaça podem ser negociados com outros jogadores no Mercado do Abrigo. Eles não podem ser vendidos ao Mercador NPC.",
        ],
      },
    ],
    related: [
      { label: "Ameaças Globais", to: "/wiki/systems/ameacas-globais" },
      { label: "Casulos", to: "/wiki/items?search=casulo" },
      { label: "Fragmentos", to: "/wiki/items?search=fragmento%20de%20ameaca" },
    ],
  },
  {
    slug: "mercador",
    title: "Mercador",
    eyebrow: "Abrigo",
    summary:
      "NPCs do abrigo vendem suprimentos, como poções para cada faixa de tier.",
    keywords: ["npc", "loja", "comprar", "vender", "poção", "mercado negro"],
    sections: [
      {
        title: "Compras",
        paragraphs: [
          "Escolha o item e a quantidade. O preço total aparece antes da compra e o item vai para a mochila.",
        ],
      },
      {
        title: "Venda para NPC",
        paragraphs: [
          "Itens marcados como vendáveis podem ser liquidados pelo fluxo de venda da mochila. Itens especiais protegidos, como fragmentos de ameaça, são rejeitados.",
        ],
      },
    ],
    related: [
      { label: "Poções", to: "/wiki/systems/pocoes" },
      {
        label: "Mercado entre jogadores",
        to: "/wiki/systems/mercado-do-abrigo",
      },
    ],
  },
  {
    slug: "mercado-do-abrigo",
    title: "Mercado do Abrigo",
    eyebrow: "Comércio entre jogadores",
    summary: "Permite comprar e vender itens negociáveis entre jogadores.",
    keywords: ["mercado", "trade", "troca", "anunciar", "comprar", "vender"],
    sections: [
      {
        title: "Anunciar",
        bullets: [
          "Somente itens marcados como negociáveis podem ser publicados.",
          "A quantidade anunciada sai da mochila e fica reservada no anúncio.",
          "Cancelar devolve apenas a quantidade ainda não vendida.",
        ],
      },
      {
        title: "Comprar",
        paragraphs: [
          "Escolha a quantidade desejada e confirme o valor total. A compra só é concluída quando o item e o Gold são transferidos corretamente.",
          "Não é permitido comprar anúncio de outro personagem da mesma conta.",
        ],
      },
      {
        title: "Status",
        paragraphs: [
          "Anúncios sem quantidade restante aparecem como Vendido. Preço e quantidade efetivamente cobrados ficam registrados no histórico da compra.",
        ],
      },
    ],
    related: [
      { label: "Itens negociáveis", to: "/wiki/items" },
      { label: "Mochila", to: "/wiki/systems/mochila-e-banco" },
    ],
  },
  {
    slug: "objetivos",
    title: "Objetivos",
    eyebrow: "Progressão",
    summary: "Mostra o próximo objetivo e recompensa seu progresso.",
    keywords: ["missão", "missao", "conquista", "tutorial", "objetivo"],
    sections: [
      {
        title: "Tutorial",
        paragraphs: [
          "Apresenta as ações básicas: coletar, fabricar, equipar e iniciar uma caça.",
        ],
      },
      {
        title: "Missões",
        paragraphs: [
          "Missões de história, diárias e semanais mostram objetivo, progresso e recompensa. O prêmio é liberado após a conclusão.",
        ],
      },
      {
        title: "Conquistas",
        paragraphs: [
          "Conquistas usam métricas acumuladas, como nível, inimigos derrotados, itens fabricados e incursões concluídas.",
        ],
      },
    ],
    related: [
      { label: "Começando", to: "/wiki/getting-started" },
      { label: "Progressão", to: "/wiki/progression" },
    ],
  },
  {
    slug: "mapas",
    title: "Mapas e viagem",
    eyebrow: "Mundo",
    summary:
      "Regiões e subáreas organizam tiers, faixas de nível, encontros e atividades disponíveis.",
    keywords: ["mapa", "área", "região", "viajar", "desbloquear"],
    sections: [
      {
        title: "Estrutura",
        bullets: [
          "Cada mapa possui tier, nível mínimo, nível máximo e subáreas.",
          "Subáreas possuem encontros ativos com pesos que determinam quais monstros podem aparecer.",
          "Incursões e Ameaças Globais também são vinculadas a mapas específicos.",
        ],
      },
      {
        title: "Desbloqueio",
        paragraphs: [
          "Seu nível precisa estar dentro da faixa exigida. Mapas bloqueados mostram o requisito antes da viagem.",
        ],
      },
    ],
    related: [
      { label: "Catálogo de mapas", to: "/wiki/maps" },
      { label: "Bestiário", to: "/wiki/monsters" },
    ],
  },
  {
    slug: "premium",
    title: "Premium",
    eyebrow: "Conta",
    summary: "Amplia o progresso ocioso e concede bônus de experiência.",
    keywords: ["premium", "assinatura", "bonus", "idle"],
    sections: [
      {
        title: "Benefícios atuais",
        bullets: [
          "Limite ocioso de até 12 horas, em vez de 6 horas na conta gratuita.",
          "Bônus de 20% de experiência nas atividades compatíveis.",
          "A validade pertence à conta e vale para seus personagens.",
        ],
      },
      {
        title: "Compras",
        paragraphs: [
          "As ofertas podem aparecer na loja, mas a cobrança ainda não está disponível.",
        ],
      },
    ],
    related: [{ label: "Progressão", to: "/wiki/progression" }],
  },
  {
    slug: "comunidade",
    title: "Comunidade",
    eyebrow: "Social",
    summary:
      "Ranking, aliados, inspeção de personagens, sobreviventes ativos e chat geral conectam o abrigo.",
    keywords: ["amigos", "aliados", "ranking", "chat", "online", "inspecionar"],
    sections: [
      {
        title: "Recursos sociais",
        bullets: [
          "A lista de ativos mostra personagens online ou em atividade e permite inspeção.",
          "Pedidos de aliado precisam ser aceitos pelo outro jogador.",
          "Ranking e inspeção apresentam dados públicos do personagem.",
          "O chat geral mostra mensagens recentes e novas mensagens em tempo real.",
        ],
      },
    ],
    related: [
      { label: "Mercado do Abrigo", to: "/wiki/systems/mercado-do-abrigo" },
    ],
  },
  {
    slug: "aparencia",
    title: "Aparência",
    eyebrow: "Personagem",
    summary:
      "Personaliza avatar, moldura, banner, fundo, efeito, título e distintivo sem alterar atributos de combate.",
    keywords: ["avatar", "cosmético", "cosmetico", "moldura", "banner"],
    sections: [
      {
        title: "Coleções cosméticas",
        paragraphs: [
          "O catálogo mostra as opções disponíveis para sua classe e conta. A aparência escolhida aparece no painel, mapa, ranking e inspeção.",
        ],
      },
      {
        title: "Regra importante",
        paragraphs: [
          "Cosméticos modificam somente a apresentação. Equipamentos e atributos continuam sendo calculados pelos sistemas de combate.",
        ],
      },
    ],
    related: [
      { label: "Equipamentos", to: "/wiki/systems/equipamentos-e-reforco" },
      { label: "Comunidade", to: "/wiki/systems/comunidade" },
    ],
  },
];

export const COMBAT_PAGE: WikiEditorialPage = {
  slug: "combat",
  title: "Combate e atributos",
  eyebrow: "Mecânica central",
  summary: "Entenda o que aumenta seu dano e reduz o risco de derrota.",
  keywords: ["dano", "defesa", "crítico", "velocidade", "atributo", "hp"],
  sections: [
    {
      title: "Como a batalha é resolvida",
      paragraphs: [
        "Ataque, defesa, crítico e velocidade definem quanto dano cada lado causa e quantas vezes consegue atacar.",
      ],
    },
    {
      title: "Atributos primários",
      bullets: [
        "Força, Vitalidade, Agilidade, Precisão, Técnica e Vontade possuem bases por classe, ganhos de nível e bônus de equipamento.",
        "Cada classe converte esses valores em ataque, vida, defesa, velocidade e demais estatísticas com pesos próprios.",
        "Bônus por 2, 4 ou 6 equipamentos consideram peças coerentes por tier, evitando que equipamentos antigos amplifiquem indefinidamente a progressão de nível.",
      ],
    },
    {
      title: "Encontro",
      bullets: [
        "O tempo para derrotar o alvo define quantas oportunidades de ataque o monstro recebe no combate automático.",
        "Ataque, defesa, velocidade e pressão do tier do monstro participam do dano recebido.",
        "A poção configurada é usada automaticamente quando sua condição de vida é atingida.",
      ],
    },
    {
      title: "Derrota e recuperação",
      paragraphs: [
        "Quando o personagem fica sem vida, a sessão é encerrada como derrota. A recuperação pode usar poções fora de combate quando permitido ou os tratamentos da Enfermaria.",
      ],
    },
  ],
  related: [
    { label: "Combate automático", to: "/wiki/systems/combate-automatico" },
    { label: "Equipamentos", to: "/wiki/systems/equipamentos-e-reforco" },
    { label: "Monstros", to: "/wiki/monsters" },
  ],
};

export const PROGRESSION_PAGE: WikiEditorialPage = {
  slug: "progression",
  title: "Progressão",
  eyebrow: "Níveis e tiers",
  summary:
    "A evolução combina nível do personagem, equipamentos, proficiências, mapas e atividades desbloqueadas.",
  keywords: ["nível", "level", "xp", "tier", "desbloqueio", "evoluir"],
  sections: [
    {
      title: "Níveis e tiers",
      paragraphs: [
        "O conteúdo atual vai até o nível 50: T1 nos níveis 1–10, T2 nos níveis 11–20, e assim por diante até o T5.",
      ],
    },
    {
      title: "Experiência",
      paragraphs: [
        "Combate automático, incursões, Ameaças Globais e missões concedem XP. Premium adiciona 20% nas atividades compatíveis.",
      ],
    },
    {
      title: "O que acompanhar",
      bullets: [
        "Nível do personagem para mapas, monstros, incursões e bosses.",
        "Tier e coerência dos equipamentos atuais.",
        "Proficiência de cada Expedição e de Criação.",
        "Poções e custos sustentáveis para sessões longas.",
        "Objetivos disponíveis e recompensas ainda não reivindicadas.",
      ],
    },
    {
      title: "Rota recomendada",
      paragraphs: [
        "No início de cada tier, os equipamentos anteriores ainda podem enfrentar os primeiros alvos, porém com menor eficiência e maior consumo. No meio e no fim da faixa, produzir e equipar peças do tier atual passa a ser a progressão esperada.",
      ],
    },
  ],
  related: [
    { label: "Começando", to: "/wiki/getting-started" },
    { label: "Mapas", to: "/wiki/maps" },
    { label: "Objetivos", to: "/wiki/systems/objetivos" },
  ],
};

export const WIKI_GUIDES: Array<{
  question: string;
  answer: string;
  links: WikiEditorialLink[];
  keywords: string[];
}> = [
  {
    question: "O que eu faço agora?",
    answer:
      "Confira o mapa, colete recursos, fabrique uma peça adequada ao seu tier e use o combate automático para avançar.",
    links: [{ label: "Seguir o guia inicial", to: "/wiki/getting-started" }],
    keywords: ["perdido", "agora", "começar"],
  },
  {
    question: "Como consigo um equipamento melhor?",
    answer:
      "Procure uma peça da sua classe e do seu tier. Reúna materiais em Expedições e nos monstros para fabricá-la em Criação, ou compre de outro jogador no Mercado do Abrigo. Depois abra Equipamentos, escolha o slot, compare os atributos e equipe a melhor peça.",
    links: [
      { label: "Equipamentos", to: "/wiki/systems/equipamentos-e-reforco" },
      { label: "Criação", to: "/wiki/systems/criacao" },
      { label: "Mercado", to: "/wiki/systems/mercado-do-abrigo" },
    ],
    keywords: ["item", "equipamento", "melhor", "onde", "drop", "comprar"],
  },
  {
    question: "Por que não consigo entrar em uma área?",
    answer:
      "Compare seu nível com a faixa do mapa e verifique se já existe uma atividade exclusiva em andamento.",
    links: [
      { label: "Consultar mapas", to: "/wiki/maps" },
      { label: "Entender progressão", to: "/wiki/progression" },
    ],
    keywords: ["bloqueado", "mapa", "nível"],
  },
  {
    question: "Por que estou gastando muitas poções?",
    answer:
      "Revise o tier do equipamento, o alvo e a poção configurada. Quanto mais demorar para derrotar o monstro, mais ataques você recebe.",
    links: [
      { label: "Combate", to: "/wiki/combat" },
      { label: "Poções", to: "/wiki/systems/pocoes" },
    ],
    keywords: ["poção", "dano", "morrendo", "vida"],
  },
  {
    question: "Como reforço meu equipamento?",
    answer:
      "Faça Incursões para conseguir Fragmentos de Reforço. Depois abra Equipamentos, escolha o slot da peça equipada e clique em Reforçar. Cada peça usa fragmentos do mesmo tier mais Gold; o reforço vai até +3 e não falha.",
    links: [
      { label: "Equipamentos", to: "/wiki/systems/equipamentos-e-reforco" },
      { label: "Incursões", to: "/wiki/systems/incursoes" },
    ],
    keywords: [
      "reforçar",
      "reforco",
      "equipamento",
      "fragmento",
      "incursão",
      "+3",
    ],
  },
  {
    question: "Como consigo um pet?",
    answer:
      "Participe de Ameaças Globais. Ao vencer, você recebe fragmentos e pode ganhar um casulo. Abra Pets, escolha o casulo, inicie a incubação e, quando terminar, resgate e equipe o pet.",
    links: [
      { label: "Pets", to: "/wiki/systems/pets" },
      { label: "Ameaças Globais", to: "/wiki/systems/ameacas-globais" },
    ],
    keywords: ["pet", "casulo", "fragmento"],
  },
];

export const ALL_EDITORIAL_PAGES = [
  GETTING_STARTED_PAGE,
  COMBAT_PAGE,
  PROGRESSION_PAGE,
  ...WIKI_SYSTEM_PAGES,
];

export function getSystemPage(slug?: string) {
  return WIKI_SYSTEM_PAGES.find((page) => page.slug === slug) ?? null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const EDITORIAL_SEARCH_STOP_WORDS = new Set([
  "a",
  "as",
  "como",
  "consigo",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "encontro",
  "eu",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "onde",
  "os",
  "para",
  "pega",
  "pegar",
  "por",
  "qual",
  "que",
  "um",
  "uma",
]);

function differsByAtMostOneCharacter(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left === right) return true;

  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return (
    differences +
      Number(leftIndex < left.length || rightIndex < right.length) <=
    1
  );
}

function matchesEditorialTerm(haystack: string, words: string[], term: string) {
  if (haystack.includes(term)) return true;
  if (term.length < 4) return false;
  return words.some((word) => differsByAtMostOneCharacter(word, term));
}

function getEditorialMatchScore(page: WikiEditorialPage, terms: string[]) {
  const title = normalize(page.title);
  const titleWords = title.split(/[^a-z0-9]+/).filter(Boolean);
  const keywords = normalize(page.keywords.join(" "));
  const keywordWords = keywords.split(/[^a-z0-9]+/).filter(Boolean);
  const summary = normalize(page.summary);
  const summaryWords = summary.split(/[^a-z0-9]+/).filter(Boolean);

  return terms.reduce((score, term) => {
    if (matchesEditorialTerm(title, titleWords, term)) return score + 12;
    if (matchesEditorialTerm(keywords, keywordWords, term)) return score + 9;
    if (matchesEditorialTerm(summary, summaryWords, term)) return score + 4;
    return score + 1;
  }, 0);
}

export function searchEditorialPages(query: string) {
  const needle = normalize(query.trim());
  if (needle.length < 2) return [];
  const terms = needle
    .split(/[^a-z0-9]+/)
    .filter(
      (term) => term.length >= 2 && !EDITORIAL_SEARCH_STOP_WORDS.has(term),
    );
  if (!terms.length) return [];

  return ALL_EDITORIAL_PAGES.map((page, index) => {
    const haystack = normalize(
      [
        page.title,
        page.summary,
        ...page.keywords,
        ...page.sections.flatMap((section) => [
          section.title,
          ...(section.paragraphs ?? []),
          ...(section.bullets ?? []),
        ]),
      ].join(" "),
    );
    const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
    return {
      page,
      index,
      matches: terms.every((term) =>
        matchesEditorialTerm(haystack, words, term),
      ),
      score: getEditorialMatchScore(page, terms),
    };
  })
    .filter((result) => result.matches)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 8)
    .map((result) => result.page);
}
