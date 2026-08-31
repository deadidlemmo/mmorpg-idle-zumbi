import { PrismaService } from '../../prisma/prisma.service';
import { toWikiSlug } from './wiki-slug.util';
import { WikiService } from './wiki.service';

describe('WikiService', () => {
  const prisma = {
    item: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    mob: {
      findMany: jest.fn(),
    },
    gameMap: {
      findMany: jest.fn(),
    },
    worldBoss: {
      findMany: jest.fn(),
    },
  };
  const service = new WikiService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gera slugs estáveis e amigáveis para entidades sem slug persistido', () => {
    expect(toWikiSlug('Zumbi Enfermeiro')).toBe('zumbi-enfermeiro');
    expect(toWikiSlug('Núcleo Infectado: Elite T3')).toBe(
      'nucleo-infectado-elite-t3',
    );
  });

  it('lista itens com paginação e relações resumidas sem duplicar dados', async () => {
    prisma.item.findMany.mockResolvedValue([
      {
        id: 'item-1',
        slug: null,
        name: 'Bandagem de Campo',
        description: 'Recupera vida.',
        tier: 1,
        rarity: 'COMMON',
        slot: 'CONSUMABLE',
        family: 'Pocao',
        materialOrigin: null,
        materialSlot: null,
        isGatheringMaterial: false,
        isCraftable: false,
        isSellable: true,
        isTradable: true,
        enhancementLevel: 0,
        class: null,
        map: { id: 'map-1', name: 'Subúrbio Silencioso', tier: 1 },
        _count: {
          mobDrops: 2,
          craftingIngredients: 1,
          worldBossRewards: 0,
          incursionLootTables: 0,
        },
      },
    ]);
    prisma.item.count.mockResolvedValue(1);

    const result = await service.listItems({
      search: 'bandagem',
      tier: 1,
      page: 1,
      pageSize: 24,
    });

    expect(result.items[0]).toMatchObject({
      slug: 'bandagem-de-campo',
      relatedCounts: { monsterDrops: 2, recipes: 1 },
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 24,
      total: 1,
      totalPages: 1,
    });
    const listCalls = prisma.item.findMany.mock.calls as unknown as Array<
      [unknown]
    >;
    const listCall = listCalls[0]?.[0] as {
      where?: {
        tier?: number;
        AND?: Array<{
          enhancementLevel?: number;
          tier?: { lte?: number };
          OR?: unknown[];
        }>;
      };
      skip?: number;
      take?: number;
    };
    expect(listCall.where?.tier).toBe(1);
    expect(listCall.where?.AND?.[0]).toMatchObject({
      enhancementLevel: 0,
      tier: { lte: 5 },
    });
    expect(listCall.where?.AND?.[0].OR).toEqual(
      expect.arrayContaining([
        { tier: 0 },
        { isGatheringMaterial: true },
        { isCraftable: true },
        { slot: 'CONSUMABLE' },
      ]),
    );
    expect(listCall.skip).toBe(0);
    expect(listCall.take).toBe(24);
  });

  it('não abre item reforçado ou histórico fora do catálogo publicado', async () => {
    prisma.item.findFirst.mockResolvedValue(null);
    prisma.item.findMany.mockResolvedValue([]);

    await expect(
      service.getItem('armadura-de-retalhos-pesados-1'),
    ).rejects.toThrow('Item não encontrado na Wiki.');

    const directCalls = prisma.item.findFirst.mock.calls as unknown as Array<
      [unknown]
    >;
    const directCall = directCalls[0]?.[0] as {
      where?: { AND?: Array<{ enhancementLevel?: number }> };
    };
    expect(directCall.where?.AND?.[0]).toMatchObject({ enhancementLevel: 0 });
    const fallbackCalls = prisma.item.findMany.mock.calls as unknown as Array<
      [unknown]
    >;
    const fallbackCall = fallbackCalls[0]?.[0] as {
      where?: { AND?: Array<{ enhancementLevel?: number }> };
    };
    expect(fallbackCall.where?.AND?.[0]).toMatchObject({ enhancementLevel: 0 });
  });

  it('separa a pesquisa global por categoria', async () => {
    prisma.item.findMany.mockResolvedValue([]);
    prisma.mob.findMany.mockResolvedValue([
      {
        id: 'mob-1',
        name: 'Zumbi Enfermeiro',
        description: null,
        level: 3,
        tier: 1,
        hp: 20,
        attack: 4,
        defense: 1,
        speed: 2,
        xpReward: 8,
        map: { id: 'map-1', name: 'Subúrbio Silencioso', tier: 1 },
      },
    ]);
    prisma.gameMap.findMany.mockResolvedValue([]);
    prisma.worldBoss.findMany.mockResolvedValue([]);

    const result = await service.search('enfermeiro');

    expect(result.groups.monsters).toEqual([
      expect.objectContaining({
        slug: 'zumbi-enfermeiro',
        name: 'Zumbi Enfermeiro',
      }),
    ]);
    expect(result.groups.items).toEqual([]);
  });

  it('combina termos da pesquisa sem exigir uma frase contígua', async () => {
    prisma.item.findMany.mockResolvedValue([]);
    prisma.mob.findMany.mockResolvedValue([]);
    prisma.gameMap.findMany.mockResolvedValue([]);
    prisma.worldBoss.findMany.mockResolvedValue([]);

    await service.search('fragmento ameaça');

    const searchCalls = prisma.item.findMany.mock.calls as unknown as Array<
      [unknown]
    >;
    const searchCall = searchCalls[0]?.[0] as {
      where?: { AND?: Array<{ OR?: unknown[] }> };
    };
    expect(searchCall.where?.AND).toHaveLength(3);
    expect(
      searchCall.where?.AND?.slice(1).every((filter) =>
        Array.isArray(filter.OR),
      ),
    ).toBe(true);
  });

  it('ignora palavras de pergunta e pesquisa somente o termo útil', async () => {
    prisma.item.findMany.mockResolvedValue([]);
    prisma.mob.findMany.mockResolvedValue([]);
    prisma.gameMap.findMany.mockResolvedValue([]);
    prisma.worldBoss.findMany.mockResolvedValue([]);

    await service.search('onde consigo pegar bandagem');

    const searchCalls = prisma.item.findMany.mock.calls as unknown as Array<
      [unknown]
    >;
    const searchCall = searchCalls[0]?.[0] as {
      where?: { AND?: Array<{ OR?: unknown[] }> };
    };
    expect(searchCall.where?.AND).toHaveLength(2);
    expect(JSON.stringify(searchCall.where)).not.toContain('onde');
    expect(JSON.stringify(searchCall.where)).not.toContain('pegar');
  });

  it('corrige um pequeno erro em termos comuns do jogo', async () => {
    prisma.item.findMany.mockResolvedValue([]);
    prisma.mob.findMany.mockResolvedValue([]);
    prisma.gameMap.findMany.mockResolvedValue([]);
    prisma.worldBoss.findMany.mockResolvedValue([]);

    await service.search('pocoe');

    const searchCalls = prisma.item.findMany.mock.calls as unknown as Array<
      [unknown]
    >;
    const searchCall = searchCalls[0]?.[0] as { where?: unknown };
    expect(JSON.stringify(searchCall.where)).toContain('poções');
  });

  it('entende categoria e tier sem exigir um nome de boss', async () => {
    prisma.worldBoss.findMany.mockResolvedValue([]);

    const result = await service.search('boss T2');

    expect(prisma.item.findMany).not.toHaveBeenCalled();
    expect(prisma.mob.findMany).not.toHaveBeenCalled();
    expect(prisma.gameMap.findMany).not.toHaveBeenCalled();
    const bossCalls = prisma.worldBoss.findMany.mock.calls as unknown as Array<
      [
        {
          where?: {
            tier?: number;
            AND?: Array<{
              tier?: { lte?: number };
              isActive?: boolean;
            }>;
          };
        },
      ]
    >;
    expect(bossCalls[0]?.[0].where?.tier).toBe(2);
    expect(bossCalls[0]?.[0].where?.AND?.[0]).toMatchObject({
      isActive: true,
      tier: { lte: 5 },
    });
    expect(result.groups.bosses).toEqual([]);
  });

  it('filtra mapas pela faixa de nível em perguntas naturais', async () => {
    prisma.gameMap.findMany.mockResolvedValue([]);

    await service.search('mapa nível 20');

    const mapCalls = prisma.gameMap.findMany.mock.calls as unknown as Array<
      [
        {
          where?: {
            minLevel?: { lte?: number };
            maxLevel?: { gte?: number };
          };
        },
      ]
    >;
    expect(mapCalls[0]?.[0].where).toMatchObject({
      minLevel: { lte: 20 },
      maxLevel: { gte: 20 },
    });
  });
});
