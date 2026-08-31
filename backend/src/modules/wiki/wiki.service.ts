import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type GameMap,
  type Item,
  type Mob,
  Prisma,
  type WorldBoss,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WikiCatalogQueryDto } from './dto/wiki-catalog-query.dto';
import { WIKI_LAUNCH_TIER_CAP } from './wiki.constants';
import { toWikiSlug } from './wiki-slug.util';

const DEFAULT_PAGE_SIZE = 24;
const WIKI_STANDALONE_ITEM_FAMILIES = [
  'Ficha de Incursão',
  'Material de Reforço',
  'Material de Ameaça Global',
] as const;

function buildWikiItemVisibilityWhere(): Prisma.ItemWhereInput {
  return {
    enhancementLevel: 0,
    tier: { lte: WIKI_LAUNCH_TIER_CAP },
    OR: [
      { tier: 0 },
      { isGatheringMaterial: true },
      { isCraftable: true },
      { slot: 'CONSUMABLE' },
      {
        mobDrops: {
          some: {
            mob: {
              tier: { lte: WIKI_LAUNCH_TIER_CAP },
              subMapEncounters: { some: { isActive: true } },
            },
          },
        },
      },
      {
        craftingRecipeOutput: {
          is: { isActive: true, tier: { lte: WIKI_LAUNCH_TIER_CAP } },
        },
      },
      {
        craftingIngredients: {
          some: {
            recipe: {
              isActive: true,
              tier: { lte: WIKI_LAUNCH_TIER_CAP },
            },
          },
        },
      },
      {
        incursionLootTables: {
          some: {
            incursion: {
              isActive: true,
              tier: { lte: WIKI_LAUNCH_TIER_CAP },
            },
          },
        },
      },
      {
        worldBossRewards: {
          some: {
            worldBoss: {
              isActive: true,
              tier: { lte: WIKI_LAUNCH_TIER_CAP },
            },
          },
        },
      },
      { petDefinition: { is: { isActive: true } } },
      { petFragmentDefinitions: { some: { isActive: true } } },
      { family: { in: [...WIKI_STANDALONE_ITEM_FAMILIES] } },
    ],
  };
}

function buildWikiMonsterVisibilityWhere(): Prisma.MobWhereInput {
  return {
    tier: { lte: WIKI_LAUNCH_TIER_CAP },
    subMapEncounters: { some: { isActive: true } },
  };
}

function buildWikiMapVisibilityWhere(): Prisma.GameMapWhereInput {
  return { tier: { lte: WIKI_LAUNCH_TIER_CAP } };
}

function buildWikiBossVisibilityWhere(): Prisma.WorldBossWhereInput {
  return {
    isActive: true,
    tier: { lte: WIKI_LAUNCH_TIER_CAP },
  };
}

type WikiClassRef = {
  id: string;
  name: string;
};

type WikiMapRef = {
  id: string;
  name: string;
  tier: number;
};

type WikiSubMapRef = {
  id: string;
  name: string;
  tier: number;
  minLevel?: number;
  maxLevel?: number;
};

type ItemSummarySource = Pick<
  Item,
  | 'id'
  | 'slug'
  | 'name'
  | 'description'
  | 'tier'
  | 'rarity'
  | 'slot'
  | 'family'
  | 'materialOrigin'
  | 'materialSlot'
  | 'isGatheringMaterial'
  | 'isCraftable'
  | 'isSellable'
  | 'isTradable'
  | 'enhancementLevel'
> & {
  class?: WikiClassRef | null;
  map?: WikiMapRef | null;
  _count?: Partial<{
    mobDrops: number;
    craftingIngredients: number;
    worldBossRewards: number;
    incursionLootTables: number;
  }>;
};

type MonsterSummarySource = Pick<
  Mob,
  | 'id'
  | 'name'
  | 'description'
  | 'level'
  | 'tier'
  | 'hp'
  | 'attack'
  | 'defense'
  | 'speed'
  | 'xpReward'
> & {
  map?: WikiMapRef | null;
  subMapEncounters?: Array<{ subMap: WikiSubMapRef }>;
  _count?: { drops?: number };
  drops?: unknown[];
};

type MapSummarySource = Pick<
  GameMap,
  'id' | 'name' | 'description' | 'tier' | 'minLevel' | 'maxLevel'
> & {
  _count?: Partial<{
    subMaps: number;
    mobs: number;
    worldBosses: number;
    incursions: number;
    items: number;
  }>;
};

type BossSummarySource = Pick<
  WorldBoss,
  | 'id'
  | 'slug'
  | 'name'
  | 'description'
  | 'tier'
  | 'minLevel'
  | 'maxLevel'
  | 'baseHp'
  | 'maxHp'
  | 'attackPower'
  | 'defense'
  | 'resistance'
  | 'mutationLevel'
  | 'durationSeconds'
  | 'difficulty'
  | 'riskLevel'
  | 'minParticipationSeconds'
  | 'minParticipationDamage'
  | 'imageUrl'
  | 'assetKey'
> & {
  map?: WikiMapRef | null;
  _count?: { rewards?: number };
  rewards?: unknown[];
};

function normalizeSearch(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 80) : undefined;
}

type WikiSearchCategory = 'items' | 'monsters' | 'maps' | 'bosses';

const SEARCH_STOP_WORDS = new Set([
  'a',
  'as',
  'como',
  'consigo',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'encontro',
  'eu',
  'me',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'onde',
  'os',
  'para',
  'pega',
  'pegar',
  'por',
  'qual',
  'que',
  'um',
  'uma',
]);

const SEARCH_CATEGORY_TERMS: Record<string, WikiSearchCategory> = {
  item: 'items',
  itens: 'items',
  monstro: 'monsters',
  monstros: 'monsters',
  mob: 'monsters',
  mobs: 'monsters',
  mapa: 'maps',
  mapas: 'maps',
  regiao: 'maps',
  regioes: 'maps',
  boss: 'bosses',
  bosses: 'bosses',
  chefe: 'bosses',
  chefes: 'bosses',
};

const SEARCH_TERM_ALIASES: Record<string, string[]> = {
  ameaca: ['ameaça', 'ameaças', 'ameaca', 'ameacas'],
  ameacas: ['ameaça', 'ameaças', 'ameaca', 'ameacas'],
  criacao: ['criação', 'criacao'],
  incursao: ['incursão', 'incursões', 'incursao', 'incursoes'],
  incursoes: ['incursão', 'incursões', 'incursao', 'incursoes'],
  medico: ['médico', 'medico'],
  nucleo: ['núcleo', 'nucleo'],
  pocao: ['poção', 'poções', 'pocao', 'pocoes'],
  pocoes: ['poção', 'poções', 'pocao', 'pocoes'],
  reforco: ['reforço', 'reforco'],
  suburbio: ['subúrbio', 'suburbio'],
};

function normalizeSearchToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseWikiSearch(rawQuery: string) {
  const query = rawQuery.trim().slice(0, 80);
  const tokens = normalizeSearchToken(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let category: WikiSearchCategory | undefined;
  let tier: number | undefined;
  let level: number | undefined;
  const ignoredIndexes = new Set<number>();

  tokens.forEach((token, index) => {
    const categoryMatch = SEARCH_CATEGORY_TERMS[token];
    if (categoryMatch) {
      category ??= categoryMatch;
      ignoredIndexes.add(index);
    }

    const compactTier = token.match(/^t(?:ier)?(10|[1-9])$/);
    if (compactTier) {
      tier = Number(compactTier[1]);
      ignoredIndexes.add(index);
    }
    const compactLevel = token.match(/^(?:nivel|level|nv)(\d{1,3})$/);
    if (compactLevel) {
      level = Number(compactLevel[1]);
      ignoredIndexes.add(index);
    }

    if (
      (token === 'tier' || token === 't') &&
      /^\d+$/.test(tokens[index + 1] ?? '')
    ) {
      tier = Number(tokens[index + 1]);
      ignoredIndexes.add(index);
      ignoredIndexes.add(index + 1);
    }
    if (
      (token === 'nivel' || token === 'level' || token === 'nv') &&
      /^\d+$/.test(tokens[index + 1] ?? '')
    ) {
      level = Number(tokens[index + 1]);
      ignoredIndexes.add(index);
      ignoredIndexes.add(index + 1);
    }
  });

  const terms = tokens.filter(
    (token, index) =>
      !ignoredIndexes.has(index) &&
      token.length >= 2 &&
      !SEARCH_STOP_WORDS.has(token),
  );

  return { query, terms, category, tier, level };
}

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

function getSearchVariants(term: string) {
  const exactAliases = SEARCH_TERM_ALIASES[term];
  if (exactAliases) return exactAliases;
  if (term.length >= 4) {
    const closeAlias = Object.keys(SEARCH_TERM_ALIASES).find((candidate) =>
      differsByAtMostOneCharacter(candidate, term),
    );
    if (closeAlias) return SEARCH_TERM_ALIASES[closeAlias];
  }
  return [term];
}

function getPagination(query: WikiCatalogQueryDto) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(
    60,
    Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function buildPagination(total: number, page: number, pageSize: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function mapItemSummary(item: ItemSummarySource) {
  return {
    id: item.id,
    slug: item.slug ?? toWikiSlug(item.name),
    name: item.name,
    description: item.description,
    tier: item.tier,
    rarity: item.rarity,
    slot: item.slot,
    family: item.family,
    materialOrigin: item.materialOrigin,
    materialSlot: item.materialSlot,
    isGatheringMaterial: item.isGatheringMaterial,
    isCraftable: item.isCraftable,
    isSellable: item.isSellable,
    isTradable: item.isTradable,
    enhancementLevel: item.enhancementLevel,
    class: item.class ?? null,
    map: item.map ?? null,
    relatedCounts: item._count
      ? {
          monsterDrops: item._count.mobDrops ?? 0,
          recipes: item._count.craftingIngredients ?? 0,
          worldBosses: item._count.worldBossRewards ?? 0,
          incursions: item._count.incursionLootTables ?? 0,
        }
      : undefined,
  };
}

function mapMonsterSummary(monster: MonsterSummarySource) {
  return {
    id: monster.id,
    slug: toWikiSlug(monster.name),
    name: monster.name,
    description: monster.description,
    level: monster.level,
    tier: monster.tier,
    hp: monster.hp,
    attack: monster.attack,
    defense: monster.defense,
    speed: monster.speed,
    xpReward: monster.xpReward,
    map: monster.map,
    subMaps:
      monster.subMapEncounters?.map((encounter) => encounter.subMap) ?? [],
    dropCount: monster._count?.drops ?? monster.drops?.length ?? 0,
  };
}

function mapMapSummary(map: MapSummarySource) {
  return {
    id: map.id,
    slug: toWikiSlug(map.name),
    name: map.name,
    description: map.description,
    tier: map.tier,
    minLevel: map.minLevel,
    maxLevel: map.maxLevel,
    counts: map._count
      ? {
          subMaps: map._count.subMaps ?? 0,
          monsters: map._count.mobs ?? 0,
          bosses: map._count.worldBosses ?? 0,
          incursions: map._count.incursions ?? 0,
          items: map._count.items ?? 0,
        }
      : undefined,
  };
}

function mapBossSummary(boss: BossSummarySource) {
  return {
    id: boss.id,
    slug: boss.slug,
    name: boss.name,
    description: boss.description,
    tier: boss.tier,
    minLevel: boss.minLevel,
    maxLevel: boss.maxLevel,
    baseHp: boss.baseHp,
    maxHp: boss.maxHp,
    attackPower: boss.attackPower,
    defense: boss.defense,
    resistance: boss.resistance,
    mutationLevel: boss.mutationLevel,
    durationSeconds: boss.durationSeconds,
    difficulty: boss.difficulty,
    riskLevel: boss.riskLevel,
    minParticipationSeconds: boss.minParticipationSeconds,
    minParticipationDamage: boss.minParticipationDamage,
    imageUrl: boss.imageUrl,
    assetKey: boss.assetKey,
    map: boss.map,
    rewardCount: boss._count?.rewards ?? boss.rewards?.length ?? 0,
  };
}

@Injectable()
export class WikiService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [
      itemCount,
      monsterCount,
      mapCount,
      bossCount,
      maps,
      featuredBosses,
      classes,
    ] = await Promise.all([
      this.prisma.item.count({ where: buildWikiItemVisibilityWhere() }),
      this.prisma.mob.count({
        where: buildWikiMonsterVisibilityWhere(),
      }),
      this.prisma.gameMap.count({ where: buildWikiMapVisibilityWhere() }),
      this.prisma.worldBoss.count({
        where: buildWikiBossVisibilityWhere(),
      }),
      this.prisma.gameMap.findMany({
        where: buildWikiMapVisibilityWhere(),
        orderBy: [{ tier: 'asc' }, { minLevel: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          tier: true,
          minLevel: true,
          maxLevel: true,
        },
      }),
      this.prisma.worldBoss.findMany({
        where: buildWikiBossVisibilityWhere(),
        orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }],
        take: 5,
        include: {
          map: {
            select: { id: true, name: true, tier: true },
          },
          _count: { select: { rewards: true } },
        },
      }),
      this.prisma.gameClass.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, description: true },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        items: itemCount,
        monsters: monsterCount,
        maps: mapCount,
        bosses: bossCount,
      },
      maps: maps.map(mapMapSummary),
      featuredBosses: featuredBosses.map(mapBossSummary),
      classes,
    };
  }

  async search(rawQuery: string) {
    const { query, terms, category, tier, level } = parseWikiSearch(rawQuery);
    const itemTextFilters = terms.map((term) => {
      const exactFilters = getSearchVariants(term).flatMap((variant) => [
        {
          name: {
            contains: variant,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          description: {
            contains: variant,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          family: {
            contains: variant,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ]);
      const fuzzyNameFilter =
        term.length >= 6
          ? [
              {
                AND: [
                  {
                    name: {
                      startsWith: term.slice(0, 2),
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    name: {
                      contains: term.slice(-3),
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ],
              },
            ]
          : [];
      return { OR: [...exactFilters, ...fuzzyNameFilter] };
    });
    const entityTextFilters = terms.map((term) => {
      const exactFilters = getSearchVariants(term).flatMap((variant) => [
        {
          name: {
            contains: variant,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          description: {
            contains: variant,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ]);
      const fuzzyNameFilter =
        term.length >= 6
          ? [
              {
                AND: [
                  {
                    name: {
                      startsWith: term.slice(0, 2),
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    name: {
                      contains: term.slice(-3),
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ],
              },
            ]
          : [];
      return { OR: [...exactFilters, ...fuzzyNameFilter] };
    });
    const [items, monsters, maps, bosses] = await Promise.all([
      category && category !== 'items'
        ? Promise.resolve([])
        : this.prisma.item.findMany({
            where: {
              AND: [
                buildWikiItemVisibilityWhere(),
                ...(tier ? [{ tier }] : []),
                ...itemTextFilters,
              ],
            },
            orderBy: [{ tier: 'asc' }, { name: 'asc' }],
            take: 8,
            include: {
              class: { select: { id: true, name: true } },
              map: { select: { id: true, name: true, tier: true } },
            },
          }),
      category && category !== 'monsters'
        ? Promise.resolve([])
        : this.prisma.mob.findMany({
            where: {
              AND: [buildWikiMonsterVisibilityWhere()],
              ...(tier ? { tier } : {}),
              ...(level ? { level } : {}),
              ...(entityTextFilters.length ? { AND: entityTextFilters } : {}),
            },
            orderBy: [{ tier: 'asc' }, { level: 'asc' }, { name: 'asc' }],
            take: 8,
            include: {
              map: { select: { id: true, name: true, tier: true } },
            },
          }),
      category && category !== 'maps'
        ? Promise.resolve([])
        : this.prisma.gameMap.findMany({
            where: {
              AND: [buildWikiMapVisibilityWhere()],
              ...(tier ? { tier } : {}),
              ...(level
                ? { minLevel: { lte: level }, maxLevel: { gte: level } }
                : {}),
              ...(entityTextFilters.length ? { AND: entityTextFilters } : {}),
            },
            orderBy: [{ tier: 'asc' }, { minLevel: 'asc' }],
            take: 8,
          }),
      category && category !== 'bosses'
        ? Promise.resolve([])
        : this.prisma.worldBoss.findMany({
            where: {
              AND: [buildWikiBossVisibilityWhere()],
              ...(tier ? { tier } : {}),
              ...(level
                ? { minLevel: { lte: level }, maxLevel: { gte: level } }
                : {}),
              ...(entityTextFilters.length ? { AND: entityTextFilters } : {}),
            },
            orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }],
            take: 8,
            include: {
              map: { select: { id: true, name: true, tier: true } },
            },
          }),
    ]);

    return {
      query,
      groups: {
        items: items.map(mapItemSummary),
        monsters: monsters.map(mapMonsterSummary),
        maps: maps.map(mapMapSummary),
        bosses: bosses.map(mapBossSummary),
      },
    };
  }

  async listItems(query: WikiCatalogQueryDto) {
    const search = normalizeSearch(query.search);
    const { page, pageSize, skip } = getPagination(query);
    const where: Prisma.ItemWhereInput = {
      AND: [
        buildWikiItemVisibilityWhere(),
        ...(search
          ? [
              {
                OR: [
                  {
                    name: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    description: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    family: {
                      contains: search,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ],
              } satisfies Prisma.ItemWhereInput,
            ]
          : []),
      ],
      ...(query.tier ? { tier: query.tier } : {}),
      ...(query.rarity ? { rarity: query.rarity } : {}),
      ...(query.slot ? { slot: query.slot } : {}),
      ...(query.mapId ? { mapId: query.mapId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: [{ tier: 'asc' }, { rarity: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
        include: {
          class: { select: { id: true, name: true } },
          map: { select: { id: true, name: true, tier: true } },
          _count: {
            select: {
              mobDrops: true,
              craftingIngredients: true,
              worldBossRewards: true,
              incursionLootTables: true,
            },
          },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    return {
      items: items.map(mapItemSummary),
      pagination: buildPagination(total, page, pageSize),
    };
  }

  async getItem(slug: string) {
    const itemId = await this.resolveItemId(slug);
    if (!itemId) throw new NotFoundException('Item não encontrado na Wiki.');

    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      include: {
        class: { select: { id: true, name: true, description: true } },
        map: {
          select: {
            id: true,
            name: true,
            description: true,
            tier: true,
            minLevel: true,
            maxLevel: true,
          },
        },
        baseItem: { select: { id: true, name: true, slug: true, tier: true } },
        enhancementVariants: {
          orderBy: { enhancementLevel: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
            enhancementLevel: true,
          },
        },
        mobDrops: {
          orderBy: [{ dropChance: 'desc' }, { minQuantity: 'desc' }],
          include: {
            mob: {
              include: {
                map: { select: { id: true, name: true, tier: true } },
                subMapEncounters: {
                  where: { isActive: true },
                  select: {
                    subMap: {
                      select: { id: true, name: true, tier: true },
                    },
                  },
                },
              },
            },
          },
        },
        craftingRecipeOutput: {
          include: {
            ingredients: {
              orderBy: { quantity: 'desc' },
              include: { item: true },
            },
          },
        },
        craftingIngredients: {
          include: {
            recipe: {
              include: {
                outputItem: true,
              },
            },
          },
        },
        incursionLootTables: {
          include: {
            incursion: {
              include: {
                map: { select: { id: true, name: true, tier: true } },
              },
            },
          },
        },
        worldBossRewards: {
          include: {
            worldBoss: {
              include: {
                map: { select: { id: true, name: true, tier: true } },
              },
            },
          },
        },
        petDefinition: true,
        petFragmentDefinitions: true,
      },
    });

    if (!item) throw new NotFoundException('Item não encontrado na Wiki.');

    return {
      ...mapItemSummary(item),
      stats: {
        strength: item.strengthBonus,
        vitality: item.vitalityBonus,
        agility: item.agilityBonus,
        precision: item.precisionBonus,
        technique: item.techniqueBonus,
        willpower: item.willpowerBonus,
        healFlat: item.healFlat,
        healPercent: item.healPercent,
      },
      requirements: {
        minTier: item.minTier,
        maxTier: item.maxTier,
        requiredGatheringLevel: item.requiredGatheringLevel,
      },
      usage: {
        usableInCombat: item.usableInCombat,
        usableOutOfCombat: item.usableOutOfCombat,
      },
      baseItem: item.baseItem
        ? {
            ...item.baseItem,
            slug: item.baseItem.slug ?? toWikiSlug(item.baseItem.name),
          }
        : null,
      enhancementVariants: item.enhancementVariants.map((variant) => ({
        ...variant,
        slug: variant.slug ?? toWikiSlug(variant.name),
      })),
      monsterDrops: item.mobDrops.map((drop) => ({
        id: drop.id,
        chance: drop.dropChance,
        minQuantity: drop.minQuantity,
        maxQuantity: drop.maxQuantity,
        monster: {
          ...mapMonsterSummary(drop.mob),
          subMaps: drop.mob.subMapEncounters.map(
            (encounter) => encounter.subMap,
          ),
        },
      })),
      crafting: {
        outputRecipe: item.craftingRecipeOutput
          ? {
              id: item.craftingRecipeOutput.id,
              tier: item.craftingRecipeOutput.tier,
              outputQuantity: item.craftingRecipeOutput.outputQuantity,
              ingredients: item.craftingRecipeOutput.ingredients.map(
                (ingredient) => ({
                  quantity: ingredient.quantity,
                  role: ingredient.role,
                  origin: ingredient.origin,
                  item: mapItemSummary(ingredient.item),
                }),
              ),
            }
          : null,
        usedInRecipes: item.craftingIngredients.map((ingredient) => ({
          quantity: ingredient.quantity,
          role: ingredient.role,
          origin: ingredient.origin,
          outputItem: mapItemSummary(ingredient.recipe.outputItem),
        })),
      },
      incursions: item.incursionLootTables.map((entry) => ({
        chance: entry.chance,
        minQuantity: entry.minQuantity,
        maxQuantity: entry.maxQuantity,
        guaranteed: entry.guaranteed,
        incursion: {
          id: entry.incursion.id,
          slug: entry.incursion.slug,
          name: entry.incursion.name,
          tier: entry.incursion.tier,
          map: entry.incursion.map,
        },
      })),
      worldBosses: item.worldBossRewards.map((reward) => ({
        chance: reward.chance,
        minQuantity: reward.minQuantity,
        maxQuantity: reward.maxQuantity,
        guaranteed: reward.guaranteed,
        onlyIfDefeated: reward.onlyIfDefeated,
        boss: mapBossSummary(reward.worldBoss),
      })),
      petDefinitions: [
        ...(item.petDefinition ? [item.petDefinition] : []),
        ...item.petFragmentDefinitions,
      ],
    };
  }

  async listMonsters(query: WikiCatalogQueryDto) {
    const search = normalizeSearch(query.search);
    const { page, pageSize, skip } = getPagination(query);
    const where: Prisma.MobWhereInput = {
      AND: [buildWikiMonsterVisibilityWhere()],
      ...(query.tier ? { tier: query.tier } : {}),
      ...(query.mapId ? { mapId: query.mapId } : {}),
      ...(query.minLevel ? { level: { gte: query.minLevel } } : {}),
      ...(query.maxLevel
        ? {
            level: {
              ...(query.minLevel ? { gte: query.minLevel } : {}),
              lte: query.maxLevel,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [monsters, total] = await Promise.all([
      this.prisma.mob.findMany({
        where,
        orderBy: [{ tier: 'asc' }, { level: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
        include: {
          map: { select: { id: true, name: true, tier: true } },
          subMapEncounters: {
            where: { isActive: true },
            select: {
              subMap: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                  minLevel: true,
                  maxLevel: true,
                },
              },
            },
          },
          _count: { select: { drops: true } },
        },
      }),
      this.prisma.mob.count({ where }),
    ]);

    return {
      monsters: monsters.map(mapMonsterSummary),
      pagination: buildPagination(total, page, pageSize),
    };
  }

  async getMonster(slug: string) {
    const monsterId = await this.resolveNamedEntityId('mob', slug);
    if (!monsterId)
      throw new NotFoundException('Monstro não encontrado na Wiki.');

    const monster = await this.prisma.mob.findUnique({
      where: { id: monsterId },
      include: {
        map: true,
        subMapEncounters: {
          where: { isActive: true },
          include: { subMap: true },
        },
        drops: {
          orderBy: [{ dropChance: 'desc' }, { minQuantity: 'desc' }],
          include: {
            item: {
              include: {
                class: { select: { id: true, name: true } },
                map: { select: { id: true, name: true, tier: true } },
              },
            },
          },
        },
      },
    });

    if (!monster)
      throw new NotFoundException('Monstro não encontrado na Wiki.');

    return {
      ...mapMonsterSummary(monster),
      subMaps: monster.subMapEncounters.map((encounter) => encounter.subMap),
      drops: monster.drops.map((drop) => ({
        id: drop.id,
        chance: drop.dropChance,
        minQuantity: drop.minQuantity,
        maxQuantity: drop.maxQuantity,
        item: mapItemSummary(drop.item),
      })),
    };
  }

  async listMaps(query: WikiCatalogQueryDto) {
    const search = normalizeSearch(query.search);
    const { page, pageSize, skip } = getPagination(query);
    const where: Prisma.GameMapWhereInput = {
      AND: [buildWikiMapVisibilityWhere()],
      ...(query.tier ? { tier: query.tier } : {}),
      ...(query.minLevel ? { maxLevel: { gte: query.minLevel } } : {}),
      ...(query.maxLevel ? { minLevel: { lte: query.maxLevel } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [maps, total] = await Promise.all([
      this.prisma.gameMap.findMany({
        where,
        orderBy: [{ tier: 'asc' }, { minLevel: 'asc' }],
        skip,
        take: pageSize,
        include: {
          _count: {
            select: {
              subMaps: true,
              mobs: true,
              worldBosses: true,
              incursions: true,
              items: true,
            },
          },
        },
      }),
      this.prisma.gameMap.count({ where }),
    ]);

    return {
      maps: maps.map(mapMapSummary),
      pagination: buildPagination(total, page, pageSize),
    };
  }

  async getMap(slug: string) {
    const mapId = await this.resolveNamedEntityId('gameMap', slug);
    if (!mapId) throw new NotFoundException('Mapa não encontrado na Wiki.');

    const map = await this.prisma.gameMap.findUnique({
      where: { id: mapId },
      include: {
        subMaps: {
          orderBy: [{ minLevel: 'asc' }, { name: 'asc' }],
          include: {
            encounters: {
              where: { isActive: true },
              orderBy: { weight: 'desc' },
              include: {
                mob: {
                  include: {
                    map: { select: { id: true, name: true, tier: true } },
                  },
                },
              },
            },
          },
        },
        mobs: {
          where: { subMapEncounters: { some: { isActive: true } } },
          orderBy: [{ level: 'asc' }, { name: 'asc' }],
          include: {
            map: { select: { id: true, name: true, tier: true } },
            _count: { select: { drops: true } },
          },
        },
        items: {
          where: buildWikiItemVisibilityWhere(),
          orderBy: [{ tier: 'asc' }, { name: 'asc' }],
          include: {
            class: { select: { id: true, name: true } },
            map: { select: { id: true, name: true, tier: true } },
          },
        },
        incursions: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { minLevel: 'asc' }],
          include: {
            lootTable: {
              orderBy: { sortOrder: 'asc' },
              include: { item: true },
            },
          },
        },
        worldBosses: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { minLevel: 'asc' }],
          include: {
            map: { select: { id: true, name: true, tier: true } },
            rewards: {
              orderBy: { sortOrder: 'asc' },
              include: { item: true },
            },
          },
        },
      },
    });

    if (!map) throw new NotFoundException('Mapa não encontrado na Wiki.');

    return {
      ...mapMapSummary(map),
      subMaps: map.subMaps.map((subMap) => ({
        id: subMap.id,
        name: subMap.name,
        description: subMap.description,
        tier: subMap.tier,
        minLevel: subMap.minLevel,
        maxLevel: subMap.maxLevel,
        encounters: subMap.encounters.map((encounter) => ({
          weight: encounter.weight,
          monster: mapMonsterSummary(encounter.mob),
        })),
      })),
      monsters: map.mobs.map(mapMonsterSummary),
      items: map.items.map(mapItemSummary),
      incursions: map.incursions.map((incursion) => ({
        id: incursion.id,
        slug: incursion.slug,
        name: incursion.name,
        description: incursion.description,
        tier: incursion.tier,
        minLevel: incursion.minLevel,
        maxLevel: incursion.maxLevel,
        goldCost: incursion.goldCost,
        durationSeconds: incursion.durationSeconds,
        difficulty: incursion.difficulty,
        riskLevel: incursion.riskLevel,
        rewards: incursion.lootTable.map((reward) => ({
          rewardType: reward.rewardType,
          chance: reward.chance,
          minQuantity: reward.minQuantity,
          maxQuantity: reward.maxQuantity,
          guaranteed: reward.guaranteed,
          item: reward.item ? mapItemSummary(reward.item) : null,
          currency: reward.currency,
        })),
      })),
      bosses: map.worldBosses.map((boss) => ({
        ...mapBossSummary(boss),
        rewards: boss.rewards.map((reward) => ({
          rewardType: reward.rewardType,
          chance: reward.chance,
          minQuantity: reward.minQuantity,
          maxQuantity: reward.maxQuantity,
          guaranteed: reward.guaranteed,
          item: reward.item ? mapItemSummary(reward.item) : null,
          currency: reward.currency,
        })),
      })),
    };
  }

  async listBosses(query: WikiCatalogQueryDto) {
    const search = normalizeSearch(query.search);
    const { page, pageSize, skip } = getPagination(query);
    const where: Prisma.WorldBossWhereInput = {
      AND: [buildWikiBossVisibilityWhere()],
      ...(query.tier ? { tier: query.tier } : {}),
      ...(query.mapId ? { mapId: query.mapId } : {}),
      ...(query.minLevel ? { maxLevel: { gte: query.minLevel } } : {}),
      ...(query.maxLevel ? { minLevel: { lte: query.maxLevel } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [bosses, total] = await Promise.all([
      this.prisma.worldBoss.findMany({
        where,
        orderBy: [{ tier: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
        include: {
          map: { select: { id: true, name: true, tier: true } },
          _count: { select: { rewards: true } },
        },
      }),
      this.prisma.worldBoss.count({ where }),
    ]);

    return {
      bosses: bosses.map(mapBossSummary),
      pagination: buildPagination(total, page, pageSize),
    };
  }

  async getBoss(slug: string) {
    const boss = await this.prisma.worldBoss.findFirst({
      where: {
        AND: [buildWikiBossVisibilityWhere(), { slug }],
      },
      include: {
        map: true,
        rewards: {
          orderBy: { sortOrder: 'asc' },
          include: { item: true },
        },
      },
    });

    if (!boss) throw new NotFoundException('Boss não encontrado na Wiki.');

    return {
      ...mapBossSummary(boss),
      scaling: {
        hpPerParticipant: boss.hpPerParticipant,
        powerScalingFactor: boss.powerScalingFactor,
        scalingFactor: boss.scalingFactor,
        minParticipantsExpected: boss.minParticipantsExpected,
        maxScalingCap: boss.maxScalingCap,
        scalingWindowSeconds: boss.scalingWindowSeconds,
        damageReduction: boss.damageReduction,
        enrageMultiplier: boss.enrageMultiplier,
      },
      rewards: boss.rewards.map((reward) => ({
        id: reward.id,
        rewardType: reward.rewardType,
        chance: reward.chance,
        minQuantity: reward.minQuantity,
        maxQuantity: reward.maxQuantity,
        guaranteed: reward.guaranteed,
        onlyIfDefeated: reward.onlyIfDefeated,
        requiresMinParticipation: reward.requiresMinParticipation,
        minContributionPercent: reward.minContributionPercent,
        randomPetCocoon: reward.randomPetCocoon,
        rarity: reward.rarity,
        currency: reward.currency,
        item: reward.item ? mapItemSummary(reward.item) : null,
      })),
    };
  }

  private async resolveItemId(slug: string) {
    const direct = await this.prisma.item.findFirst({
      where: {
        AND: [buildWikiItemVisibilityWhere(), { slug }],
      },
      select: { id: true },
    });
    if (direct) return direct.id;

    const candidates = await this.prisma.item.findMany({
      where: {
        AND: [buildWikiItemVisibilityWhere(), { slug: null }],
      },
      select: { id: true, name: true },
    });
    return (
      candidates.find((item) => toWikiSlug(item.name) === slug)?.id ?? null
    );
  }

  private async resolveNamedEntityId(model: 'mob' | 'gameMap', slug: string) {
    const candidates =
      model === 'mob'
        ? await this.prisma.mob.findMany({
            where: buildWikiMonsterVisibilityWhere(),
            select: { id: true, name: true },
          })
        : await this.prisma.gameMap.findMany({
            where: buildWikiMapVisibilityWhere(),
            select: { id: true, name: true },
          });
    return (
      candidates.find((entry) => toWikiSlug(entry.name) === slug)?.id ?? null
    );
  }
}
