import type { GameMap, SubMap } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type MapDefinition = {
  name: string;
  tier: number;
  minLevel: number;
  maxLevel: number;
  description: string;
  subMaps: string[];
};

const mapDefinitions: MapDefinition[] = [
  {
    name: 'Subúrbio Silencioso',
    tier: 1,
    minLevel: 1,
    maxLevel: 10,
    description:
      'Mapa de entrada do sistema, com foco em sobrevivência urbana básica, saque inicial e introdução às rotas de gathering.',
    subMaps: ['Rua das Cercas', 'Quintais Abandonados', 'Bloco do Síndico'],
  },
  {
    name: 'Distrito da Ferrugem',
    tier: 2,
    minLevel: 11,
    maxLevel: 20,
    description:
      'Zona industrial degradada, com oficinas abandonadas, depósitos quebrados, galpões saqueados, trilhos enferrujados e maquinário pesado em colapso.',
    subMaps: ['Pátio de Carga', 'Linha de Prensas', 'Galpão do Capataz'],
  },
  {
    name: 'Hospital Santa Ruína',
    tier: 3,
    minLevel: 21,
    maxLevel: 30,
    description:
      'Hospital colapsado, tomado por corredores escuros, alas isoladas, laboratórios abandonados e enfermarias contaminadas.',
    subMaps: ['Triagem Vazia', 'Ala de Isolamento', 'Centro Cirúrgico'],
  },
  {
    name: 'Terminal dos Esquecidos',
    tier: 4,
    minLevel: 31,
    maxLevel: 40,
    description:
      'Antiga rodoviária de evacuação, conectada a plataformas abandonadas, depósitos de bagagem, túneis de manutenção e áreas de embarque colapsadas.',
    subMaps: ['Saguão de Embarque', 'Plataformas Mortas', 'Cabine Final'],
  },
  {
    name: 'Zona de Quarentena 9',
    tier: 5,
    minLevel: 41,
    maxLevel: 50,
    description:
      'Área de contenção militar colapsada, com cercas eletrificadas, torres destruídas, contêineres de triagem, postos de descontaminação e blocos selados.',
    subMaps: ['Triagem Externa', 'Cercas Internas', 'Posto de Comando'],
  },
  {
    name: 'Refinaria do Pó Cinzento',
    tier: 6,
    minLevel: 51,
    maxLevel: 60,
    description:
      'Complexo industrial tomado por fumaça tóxica, tubulações rompidas, tanques de combustível perfurados e fornos desligados à força.',
    subMaps: ['Tanques Vazios', 'Tubulação Quente', 'Câmara da Fornalha'],
  },
  {
    name: 'Avenida dos Caídos',
    tier: 7,
    minLevel: 61,
    maxLevel: 70,
    description:
      'Centro urbano destruído, com arranha-céus quebrados, avenidas engarrafadas, ônibus queimados, fachadas destruídas e becos infestados.',
    subMaps: ['Faixa Engarrafada', 'Becos de Caça', 'Cruzamento Central'],
  },
  {
    name: 'Complexo Helix',
    tier: 8,
    minLevel: 71,
    maxLevel: 80,
    description:
      'Centro de pesquisa biomédica e tecnológica parcialmente subterrâneo, com laboratórios selados, alas de observação, câmaras de amostra e áreas de pesquisa proibida.',
    subMaps: ['Ala de Observação', 'Câmaras Seladas', 'Diretoria Helix'],
  },
  {
    name: 'Necrópole Industrial',
    tier: 9,
    minLevel: 81,
    maxLevel: 90,
    description:
      'Cemitério colossal de fábricas, galpões e linhas de produção esmagadas por ferrugem, fuligem, mutação e carne infectada presa a estruturas metálicas.',
    subMaps: ['Pátio de Escória', 'Esteiras Mortas', 'Coração da Usina'],
  },
  {
    name: 'Marco Zero',
    tier: 10,
    minLevel: 91,
    maxLevel: 100,
    description:
      'Zona final devastada por ondas de colapso biológico, ruína estrutural e saturação infecciosa. O mapa final conhecido.',
    subMaps: ['Anel Externo', 'Zona de Saturação', 'Núcleo do Colapso'],
  },
];

function getRequiredMap(
  mapsByName: Map<string, GameMap>,
  name: string,
): GameMap {
  const gameMap = mapsByName.get(name);

  if (!gameMap) {
    throw new Error(`Mapa não encontrado no seed reset: ${name}`);
  }

  return gameMap;
}

function getRequiredSubMap(
  subMapsByName: Map<string, SubMap>,
  name: string,
): SubMap {
  const subMap = subMapsByName.get(name);

  if (!subMap) {
    throw new Error(`Submapa não encontrado no seed reset: ${name}`);
  }

  return subMap;
}

async function main() {
  console.log('ATENÇÃO: iniciando seed reset destrutivo...');
  console.log(
    'Este reset apaga personagens, inventário, equipamentos, sessões, configs, mapas, mobs e itens.',
  );
  console.log('Usuários/login serão preservados.');

  console.log('Limpando dados de auto-combate...');

  await prisma.autoCombatSessionLoot.deleteMany();
  await prisma.autoCombatSessionMobSummary.deleteMany();
  await prisma.autoCombatSession.deleteMany();

  console.log('Limpando encontros, combates e configurações...');

  await prisma.subMapEncounter.deleteMany();

  await prisma.combatLog.deleteMany();
  await prisma.combat.deleteMany();

  await prisma.characterPotionConfig.deleteMany();

  console.log('Limpando progresso dos personagens...');

  await prisma.mobDrop.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.character.deleteMany();

  console.log('Limpando dados-base do jogo...');

  await prisma.item.deleteMany();
  await prisma.mob.deleteMany();
  await prisma.subMap.deleteMany();
  await prisma.gameMap.deleteMany();
  await prisma.gameClass.deleteMany();

  console.log('Criando classes...');

  const lutador = await prisma.gameClass.create({
    data: {
      name: 'Lutador',
      description:
        'Classe de linha de frente, resistente, brutal e focada em combate corpo a corpo.',

      baseStrength: 8,
      baseVitality: 8,
      baseAgility: 2,
      basePrecision: 2,
      baseTechnique: 5,
      baseWillpower: 5,
    },
  });

  const assassino = await prisma.gameClass.create({
    data: {
      name: 'Assassino',
      description:
        'Classe ágil, furtiva e focada em precisão, evasão e execução.',

      baseStrength: 5,
      baseVitality: 2,
      baseAgility: 8,
      basePrecision: 8,
      baseTechnique: 5,
      baseWillpower: 2,
    },
  });

  const atirador = await prisma.gameClass.create({
    data: {
      name: 'Atirador',
      description:
        'Classe de médio e longo alcance, focada em mira, estabilidade e controle tático.',

      baseStrength: 5,
      baseVitality: 2,
      baseAgility: 8,
      basePrecision: 8,
      baseTechnique: 5,
      baseWillpower: 2,
    },
  });

  const medico = await prisma.gameClass.create({
    data: {
      name: 'Médico',
      description:
        'Classe de suporte técnico, contenção biológica e sobrevivência clínica.',

      baseStrength: 2,
      baseVitality: 5,
      baseAgility: 2,
      basePrecision: 5,
      baseTechnique: 8,
      baseWillpower: 8,
    },
  });

  console.log('Criando mapas e submapas...');

  const mapsByName = new Map<string, GameMap>();
  const subMapsByName = new Map<string, SubMap>();

  for (const mapDefinition of mapDefinitions) {
    const gameMap = await prisma.gameMap.create({
      data: {
        name: mapDefinition.name,
        tier: mapDefinition.tier,
        minLevel: mapDefinition.minLevel,
        maxLevel: mapDefinition.maxLevel,
        description: mapDefinition.description,
      },
    });

    mapsByName.set(gameMap.name, gameMap);

    for (const subMapName of mapDefinition.subMaps) {
      const subMap = await prisma.subMap.create({
        data: {
          name: subMapName,
          description: `Submapa de ${mapDefinition.name}.`,
          tier: mapDefinition.tier,
          minLevel: mapDefinition.minLevel,
          maxLevel: mapDefinition.maxLevel,
          mapId: gameMap.id,
        },
      });

      subMapsByName.set(subMap.name, subMap);
    }
  }

  const suburbio = getRequiredMap(mapsByName, 'Subúrbio Silencioso');

  const ruaDasCercas = getRequiredSubMap(subMapsByName, 'Rua das Cercas');
  const quintaisAbandonados = getRequiredSubMap(
    subMapsByName,
    'Quintais Abandonados',
  );
  const blocoDoSindico = getRequiredSubMap(subMapsByName, 'Bloco do Síndico');

  console.log('Criando mobs iniciais...');

  const zumbiErrante = await prisma.mob.create({
    data: {
      name: 'Zumbi Errante',
      description: 'Um infectado fraco, lento e instável.',
      level: 1,
      tier: 1,
      hp: 45,
      attack: 7,
      defense: 2,
      speed: 3,
      xpReward: 7,
      mapId: suburbio.id,
    },
  });

  const infectadoQuintal = await prisma.mob.create({
    data: {
      name: 'Infectado de Quintal',
      description:
        'Um zumbi um pouco mais agressivo, encontrado próximo a casas e garagens.',
      level: 2,
      tier: 1,
      hp: 65,
      attack: 9,
      defense: 3,
      speed: 4,
      xpReward: 8,
      mapId: suburbio.id,
    },
  });

  console.log('Criando encontros dos submapas iniciais...');

  await prisma.subMapEncounter.createMany({
    data: [
      {
        subMapId: ruaDasCercas.id,
        mobId: zumbiErrante.id,
        weight: 80,
      },
      {
        subMapId: ruaDasCercas.id,
        mobId: infectadoQuintal.id,
        weight: 20,
      },
      {
        subMapId: quintaisAbandonados.id,
        mobId: zumbiErrante.id,
        weight: 50,
      },
      {
        subMapId: quintaisAbandonados.id,
        mobId: infectadoQuintal.id,
        weight: 50,
      },
      {
        subMapId: blocoDoSindico.id,
        mobId: zumbiErrante.id,
        weight: 30,
      },
      {
        subMapId: blocoDoSindico.id,
        mobId: infectadoQuintal.id,
        weight: 70,
      },
    ],
  });

  console.log(
    'Seed reset com base de itens vazia: nenhum equipamento, material, consumível, receita ou drop antigo será recriado.',
  );

  console.log('Seed reset finalizado com sucesso!');

  console.log({
    aviso:
      'Reset concluído. Usuários foram preservados, mas personagens e progresso foram apagados.',
    classes: [lutador.name, assassino.name, atirador.name, medico.name],
    mapasCriados: mapDefinitions.length,
    subMapasCriados: mapDefinitions.reduce(
      (total, mapDefinition) => total + mapDefinition.subMaps.length,
      0,
    ),
    mapaInicial: suburbio.name,
    subMapasTier1: [
      ruaDasCercas.name,
      quintaisAbandonados.name,
      blocoDoSindico.name,
    ],
    mobs: [zumbiErrante.name, infectadoQuintal.name],
    itens: [],
    consumiveis: [],
    drops: [],
  });
}

main()
  .catch((error) => {
    console.error('Erro ao executar seed reset:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
