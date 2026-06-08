import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Item } from '@prisma/client';
import {
  ActivityStatus,
  AutoCombatSessionStatus,
  CharacterStatus,
  IncursionSessionStatus,
  InventoryItemType,
  ItemSlot,
  MaterialOrigin,
  WorldBossEventStatus,
} from '@prisma/client';
import {
  AUTO_COMBAT_ROUND_DURATION_SECONDS,
} from '../../common/config/auto-combat.config';
import {
  STARTER_POTION_ITEM_NAME,
  STARTER_POTION_KIT_QUANTITY,
} from '../../common/config/starter-kit.config';
import {
  GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
  GATHERING_AFFINITY_XP_MULTIPLIER,
  GATHERING_LEVEL_CAP,
  GATHERING_PRODUCTION_BONUS_PER_LEVEL,
  GATHERING_STAT_BONUS_PER_LEVEL,
  getGatheringRateMultiplier,
  getGatheringStatBonus,
  getGatheringXpPerUnitForTier,
  getGatheringXpProgressPercent,
  getGatheringXpToNextLevel,
} from '../../common/config/gathering.config';
import { getIdleProgressLimitSeconds } from '../../common/config/membership.config';
import { calculateGatheringReward } from '../../common/utils/gathering.util';
import { getLevelProgress } from '../../common/utils/level.util';
import { isPremiumActive } from '../../common/utils/membership.util';
import { calculateFullStats } from '../../common/utils/stats.util';
import { ActivityGuardService } from '../../common/activity-guard/activity-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCharacterDto } from './dto/create-character.dto';

const MAX_CHARACTERS_PER_USER = 2;
const INITIAL_CHARACTER_GOLD = 250;
const INITIAL_CHARACTER_CASH = 0;

const GATHERING_ORIGINS = [
  MaterialOrigin.DESMANCHE,
  MaterialOrigin.COLETA,
  MaterialOrigin.CONTENCAO,
  MaterialOrigin.ARSENAL,
  MaterialOrigin.PATRULHA,
  MaterialOrigin.TECNOVARREDURA,
] as const;

type ValidGatheringOrigin = (typeof GATHERING_ORIGINS)[number];

type XpProgressSnapshot = {
  totalXp: number;

  currentLevelXp: number;
  xpToNextLevel: number;
  nextLevelXp: number;
  xpProgressPercent: number;

  xpIntoCurrentLevel: number;
  xpNeededForNextLevel: number | null;
  currentLevelStartXp: number;
  nextLevelRequiredXp: number | null;
  isAtLevelCap: boolean;

  levelProgress: {
    oldLevel: number;
    newLevel: number;

    currentXp: number;
    gainedXp: number;
    totalXp: number;

    currentLevelXp: number;
    xpToNextLevel: number;
    nextLevelXp: number;
    xpProgressPercent: number;

    leveledUp: boolean;
    levelsGained: number;

    levelCap: number;
    isAtLevelCap: boolean;

    currentLevelStartXp: number;
    nextLevelRequiredXp: number | null;

    xpIntoCurrentLevel: number;
    xpNeededForNextLevel: number | null;

    progressPercent: number;
  };
};

const ORIGIN_STAT_INFO: Record<
  ValidGatheringOrigin,
  {
    stat:
      | 'strength'
      | 'vitality'
      | 'agility'
      | 'precision'
      | 'technique'
      | 'willpower';
    label: string;
  }
> = {
  [MaterialOrigin.DESMANCHE]: {
    stat: 'strength',
    label: 'Força',
  },
  [MaterialOrigin.COLETA]: {
    stat: 'vitality',
    label: 'Vitalidade',
  },
  [MaterialOrigin.PATRULHA]: {
    stat: 'agility',
    label: 'Agilidade',
  },
  [MaterialOrigin.ARSENAL]: {
    stat: 'precision',
    label: 'Precisão',
  },
  [MaterialOrigin.TECNOVARREDURA]: {
    stat: 'technique',
    label: 'Técnica',
  },
  [MaterialOrigin.CONTENCAO]: {
    stat: 'willpower',
    label: 'Vontade',
  },
};

const CLASS_GATHERING_AFFINITIES: Record<string, ValidGatheringOrigin[]> = {
  lutador: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
  atirador: [
    MaterialOrigin.DESMANCHE,
    MaterialOrigin.ARSENAL,
    MaterialOrigin.PATRULHA,
  ],
  assassino: [
    MaterialOrigin.PATRULHA,
    MaterialOrigin.ARSENAL,
    MaterialOrigin.TECNOVARREDURA,
  ],
  medico: [
    MaterialOrigin.TECNOVARREDURA,
    MaterialOrigin.COLETA,
    MaterialOrigin.CONTENCAO,
  ],
};

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityGuard: ActivityGuardService,
  ) {}

  async create(userId: string, createCharacterDto: CreateCharacterDto) {
    const characterName = this.normalizeCharacterName(createCharacterDto.name);
    const className = this.normalizeClassName(createCharacterDto.className);

    if (!characterName) {
      throw new BadRequestException('O nome do personagem é obrigatório.');
    }

    if (!className) {
      throw new BadRequestException('A classe do personagem é obrigatória.');
    }

    if (!this.isValidCharacterName(characterName)) {
      throw new BadRequestException(
        'O nome do personagem pode conter apenas letras, números e espaços.',
      );
    }

    const character = await this.prisma.$transaction(async (tx) => {
      const totalCharacters = await tx.character.count({
        where: {
          userId,
          deletedAt: null,
        },
      });

      if (totalCharacters >= MAX_CHARACTERS_PER_USER) {
        throw new ConflictException(
          `Cada conta pode ter no máximo ${MAX_CHARACTERS_PER_USER} personagens.`,
        );
      }

      const existingCharacter = await tx.character.findFirst({
        where: {
          userId,
          name: {
            equals: characterName,
            mode: 'insensitive',
          },
        },
      });

      if (existingCharacter) {
        throw new ConflictException(
          'Você já possui ou já possuiu um personagem com este nome.',
        );
      }

      const gameClass = await tx.gameClass.findFirst({
        where: {
          name: {
            equals: className,
            mode: 'insensitive',
          },
        },
      });

      if (!gameClass) {
        throw new NotFoundException('Classe não encontrada.');
      }

      const avatarKey = this.resolveAvatarKey({
        requestedAvatarKey: createCharacterDto.avatarKey,
        className: gameClass.name,
      });

      const initialMap = await tx.gameMap.findFirst({
        where: {
          tier: 1,
        },
        orderBy: [
          {
            minLevel: 'asc',
          },
          {
            name: 'asc',
          },
        ],
      });

      if (!initialMap) {
        throw new NotFoundException('Mapa inicial não encontrado.');
      }

      const starterItems = await tx.item.findMany({
        where: {
          classId: gameClass.id,
          mapId: initialMap.id,
          tier: 0,
          isCraftable: false,
          slot: {
            in: [
              ItemSlot.MAIN_HAND,
              ItemSlot.OFF_HAND,
              ItemSlot.HEAD,
              ItemSlot.ARMOR,
              ItemSlot.PANTS,
              ItemSlot.BOOTS,
            ],
          },
        },
        orderBy: [
          {
            slot: 'asc',
          },
          {
            name: 'asc',
          },
        ],
      });

      const starterEquipment = this.getStarterEquipmentBySlot(starterItems);

      const initialEquipmentItems = [
        starterEquipment.mainHand,
        starterEquipment.offHand,
        starterEquipment.head,
        starterEquipment.armor,
        starterEquipment.pants,
        starterEquipment.boots,
      ];

      const starterPotion = await tx.item.findUnique({
        where: {
          name: STARTER_POTION_ITEM_NAME,
        },
      });

      if (!starterPotion) {
        throw new NotFoundException(
          `Poção inicial "${STARTER_POTION_ITEM_NAME}" não encontrada. Rode o seed antes de criar novos personagens.`,
        );
      }

      const initialLevel = 1;

      const stats = calculateFullStats(
        gameClass,
        initialEquipmentItems,
        initialLevel,
      );

      const initialMaxHp = stats.derivedCombatStats.maxHp;

      return tx.character.create({
        data: {
          name: characterName,
          userId,
          classId: gameClass.id,
          mapId: initialMap.id,
          status: CharacterStatus.ACTIVE,
          level: initialLevel,
          gold: INITIAL_CHARACTER_GOLD,
          cash: INITIAL_CHARACTER_CASH,
          currentHp: initialMaxHp,
          maxHp: initialMaxHp,
          avatarKey,
          deletedAt: null,

          gatheringSkills: {
            create: GATHERING_ORIGINS.map((origin) => ({
              origin,
              level: 1,
              xp: 0,
              totalXp: 0,
            })),
          },

          equipment: {
            create: {
              mainHand: {
                connect: {
                  id: starterEquipment.mainHand.id,
                },
              },
              offHand: {
                connect: {
                  id: starterEquipment.offHand.id,
                },
              },
              head: {
                connect: {
                  id: starterEquipment.head.id,
                },
              },
              armor: {
                connect: {
                  id: starterEquipment.armor.id,
                },
              },
              pants: {
                connect: {
                  id: starterEquipment.pants.id,
                },
              },
              boots: {
                connect: {
                  id: starterEquipment.boots.id,
                },
              },
            },
          },

          potionConfig: {
            create: {
              enabled: true,
              potionItemId: starterPotion.id,
              hpThresholdPercent: 35,
              useInManualCombat: true,
              useInAutoCombat: true,
            },
          },

          inventoryItems: {
            create: [
              ...initialEquipmentItems.map((item) => ({
                item: {
                  connect: {
                    id: item.id,
                  },
                },
                quantity: 1,
                type: this.getInventoryItemType(item.slot),
              })),
              {
                item: {
                  connect: {
                    id: starterPotion.id,
                  },
                },
                quantity: STARTER_POTION_KIT_QUANTITY,
                type: InventoryItemType.CONSUMABLE,
              },
            ],
          },
        },
        include: {
          class: true,
          map: true,
          gatheringSkills: true,
          inventoryItems: {
            include: {
              item: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
          equipment: {
            include: {
              mainHand: true,
              offHand: true,
              head: true,
              armor: true,
              pants: true,
              boots: true,
            },
          },
          potionConfig: {
            include: {
              potionItem: true,
            },
          },
        },
      });
    });

    const equipmentItems = this.getEquipmentItems(character);

    const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(
      character.id,
      character.class.name,
    );

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringSkills.totalStatBonus,
    );

    const calculatedMaxHp = stats.derivedCombatStats.maxHp;

    const currentHp =
      character.currentHp === null || character.currentHp === undefined
        ? calculatedMaxHp
        : this.clampHp(character.currentHp, calculatedMaxHp);

    const autoPotionConfig = this.buildPotionConfigResponse(
      character.potionConfig,
      character.inventoryItems,
    );

    return {
      ...character,
      avatarKey: this.getCharacterAvatarKey(character),
      currentHp,
      maxHp: calculatedMaxHp,
      ...this.buildCharacterXpPayload(character.level, character.xp),
      stats: this.buildStatsResponse(stats, gatheringSkills.totalStatBonus),
      gatheringSkills: gatheringSkills.skills,
      gathering: gatheringSkills,
      potionConfig: autoPotionConfig,
      potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
      autoPotionConfig,
    };
  }

  async findMine(userId: string) {
    const characters = await this.prisma.character.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        class: true,
        map: true,
        user: {
          select: {
            premiumUntil: true,
          },
        },
        inventoryItems: {
          include: {
            item: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        potionConfig: {
          include: {
            potionItem: true,
          },
        },
      },
    });

    return Promise.all(
      characters.map(async (character) => {
        const equipmentItems = this.getEquipmentItems(character);

        const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(
          character.id,
          character.class.name,
        );

        const stats = calculateFullStats(
          character.class,
          equipmentItems,
          character.level,
          gatheringSkills.totalStatBonus,
        );

        const calculatedMaxHp = stats.derivedCombatStats.maxHp;

        const currentHp =
          character.currentHp === null || character.currentHp === undefined
            ? calculatedMaxHp
            : this.clampHp(character.currentHp, calculatedMaxHp);

        const autoPotionConfig = this.buildPotionConfigResponse(
          character.potionConfig,
          character.inventoryItems,
        );

        return {
          ...character,
          avatarKey: this.getCharacterAvatarKey(character),
          currentHp,
          maxHp: calculatedMaxHp,
          ...this.buildCharacterXpPayload(character.level, character.xp),
          stats: this.buildStatsResponse(stats, gatheringSkills.totalStatBonus),
          gatheringSkills: gatheringSkills.skills,
          gathering: gatheringSkills,
          potionConfig: autoPotionConfig,
          potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
          autoPotionConfig,
        };
      }),
    );
  }

  async findOneMine(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      include: {
        class: true,
        map: true,
        inventoryItems: {
          include: {
            item: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        potionConfig: {
          include: {
            potionItem: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const equipmentItems = this.getEquipmentItems(character);

    const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(
      character.id,
      character.class.name,
    );

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringSkills.totalStatBonus,
    );

    const calculatedMaxHp = stats.derivedCombatStats.maxHp;

    const currentHp =
      character.currentHp === null || character.currentHp === undefined
        ? calculatedMaxHp
        : this.clampHp(character.currentHp, calculatedMaxHp);

    const autoPotionConfig = this.buildPotionConfigResponse(
      character.potionConfig,
      character.inventoryItems,
    );

    return {
      ...character,
      avatarKey: this.getCharacterAvatarKey(character),
      currentHp,
      maxHp: calculatedMaxHp,
      ...this.buildCharacterXpPayload(character.level, character.xp),
      stats: this.buildStatsResponse(stats, gatheringSkills.totalStatBonus),
      gatheringSkills: gatheringSkills.skills,
      gathering: gatheringSkills,
      potionConfig: autoPotionConfig,
      potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
      autoPotionConfig,
    };
  }

  async updateCurrentMap(userId: string, characterId: string, mapId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        level: true,
        status: true,
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    if (character.status !== CharacterStatus.ACTIVE) {
      throw new BadRequestException(
        'Apenas personagens ativos podem trocar de mapa.',
      );
    }

    await this.activityGuard.ensureCanTravelMap({
      userId,
      characterId: character.id,
    });

    const gameMap = await this.prisma.gameMap.findUnique({
      where: {
        id: mapId,
      },
      select: {
        id: true,
        name: true,
        minLevel: true,
      },
    });

    if (!gameMap) {
      throw new NotFoundException('Mapa não encontrado.');
    }

    if (character.level < gameMap.minLevel) {
      throw new BadRequestException(
        `Mapa bloqueado. ${gameMap.name} requer nível ${gameMap.minLevel}.`,
      );
    }

    await this.prisma.character.update({
      where: {
        id: character.id,
      },
      data: {
        mapId: gameMap.id,
      },
    });

    return this.getOverview(userId, characterId);
  }

  async getStatus(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      include: {
        class: true,
        map: true,
        inventoryItems: {
          include: {
            item: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        potionConfig: {
          include: {
            potionItem: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const equipmentItems = this.getEquipmentItems(character);

    const gatheringSkills = await this.getCharacterGatheringSkillsViewModel(
      character.id,
      character.class.name,
    );

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringSkills.totalStatBonus,
    );

    const calculatedMaxHp = stats.derivedCombatStats.maxHp;

    const currentHp =
      character.currentHp === null || character.currentHp === undefined
        ? calculatedMaxHp
        : this.clampHp(character.currentHp, calculatedMaxHp);

    const autoPotionConfig = this.buildPotionConfigResponse(
      character.potionConfig,
      character.inventoryItems,
    );

    return {
      character: {
        id: character.id,
        name: character.name,
        status: character.status,
        level: character.level,
        xp: character.xp,
        currentHp,
        maxHp: calculatedMaxHp,
        avatarKey: this.getCharacterAvatarKey(character),
        deletedAt: character.deletedAt,
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
        potionConfig: autoPotionConfig,
        potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
        autoPotionConfig,
        gatheringSkills: gatheringSkills.skills,
        gathering: gatheringSkills,
        ...this.buildCharacterXpPayload(character.level, character.xp),
      },

      class: {
        id: character.class.id,
        name: character.class.name,
        description: character.class.description,
      },

      map: character.map ? this.formatMap(character.map) : null,

      primaryStats: {
        base: stats.basePrimaryStats,
        levelBonus: stats.levelBonusStats,
        equipmentBonus: stats.equipmentBonusStats,
        gatheringBonus: gatheringSkills.totalStatBonus,
        total: stats.totalPrimaryStats,
      },

      combatStats: {
        maxHp: stats.derivedCombatStats.maxHp,
        attack: stats.derivedCombatStats.attack,
        defense: stats.derivedCombatStats.defense,
        speed: stats.derivedCombatStats.speed,
      },

      equipment: this.buildEquipmentResponse(character.equipment),

      autoPotionConfig,

      gatheringSkills: gatheringSkills.skills,
      gathering: gatheringSkills,

      inventorySummary: this.buildInventorySummary(character.inventoryItems),
    };
  }

  async getOverview(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      include: {
        class: true,
        user: {
          select: {
            premiumUntil: true,
          },
        },
        map: true,
        inventoryItems: {
          include: {
            item: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        equipment: {
          include: {
            mainHand: true,
            offHand: true,
            head: true,
            armor: true,
            pants: true,
            boots: true,
          },
        },
        potionConfig: {
          include: {
            potionItem: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const equipmentItems = this.getEquipmentItems(character);

    const autoPotionConfig = this.buildPotionConfigResponse(
      character.potionConfig,
      character.inventoryItems,
    );

    const [
      activeAutoCombatSession,
      activeGatheringSession,
      activeIncursionSession,
      activeWorldBossParticipation,
      availableMaps,
      recommendedMapByLevelRange,
      fallbackRecommendedMap,
      availableSubMapCount,
      hasCraftableRecipes,
      gatheringSkills,
    ] = await Promise.all([
      this.prisma.autoCombatSession.findFirst({
        where: {
          characterId: character.id,
          status: AutoCombatSessionStatus.ACTIVE,
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          endsAt: true,
          lastProcessedAt: true,
          durationSeconds: true,
          roundDurationSeconds: true,
          mapId: true,
          subMapId: true,

          currentMobId: true,
          currentMobHp: true,
          currentMobMaxHp: true,
          currentRound: true,
          currentCombatIndex: true,

          totalCombatsResolved: true,
          totalRoundsResolved: true,
          totalXpGained: true,

          mobSummaries: {
            select: {
              kills: true,
            },
          },

          currentMob: {
            select: {
              id: true,
              name: true,
              level: true,
              tier: true,
              hp: true,
              attack: true,
              defense: true,
              speed: true,
              xpReward: true,
            },
          },

          map: {
            select: {
              id: true,
              name: true,
              tier: true,
              minLevel: true,
              maxLevel: true,
              description: true,
            },
          },

          subMap: {
            select: {
              id: true,
              name: true,
              tier: true,
              minLevel: true,
              maxLevel: true,
              map: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                  minLevel: true,
                  maxLevel: true,
                  description: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.gatheringSession.findFirst({
        where: {
          characterId: character.id,
          status: ActivityStatus.ACTIVE,
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          origin: true,
          startedAt: true,
          lastResolvedAt: true,
          progressRemainder: true,
          map: {
            select: {
              id: true,
              name: true,
              tier: true,
              minLevel: true,
              maxLevel: true,
              description: true,
            },
          },
          targetMaterial: {
            select: {
              id: true,
              name: true,
              tier: true,
              rarity: true,
              family: true,
              materialOrigin: true,
              requiredGatheringLevel: true,
              gatheringXpPerUnit: true,
              baseGatheringRatePerHour: true,
            },
          },
        },
      }),

      this.prisma.characterIncursionSession.findFirst({
        where: {
          characterId: character.id,
          status: IncursionSessionStatus.ACTIVE,
        },
        orderBy: {
          startedAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          endsAt: true,
          completedAt: true,
          claimedAt: true,
          goldCostPaid: true,
          xpReward: true,
          goldReward: true,
          incursion: {
            select: {
              id: true,
              name: true,
              slug: true,
              tier: true,
              minLevel: true,
              maxLevel: true,
              goldCost: true,
              durationSeconds: true,
              difficulty: true,
              riskLevel: true,
              map: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.worldBossParticipant.findFirst({
        where: {
          characterId: character.id,
          leftAt: null,
          event: {
            status: {
              in: [
                WorldBossEventStatus.SCHEDULED,
                WorldBossEventStatus.LOBBY_OPEN,
                WorldBossEventStatus.ACTIVE,
              ],
            },
            endsAt: { gt: new Date() },
          },
        },
        orderBy: { joinedAt: 'desc' },
        select: {
          id: true,
          damageDealt: true,
          contributionPercent: true,
          joinedAt: true,
          activeSeconds: true,
          event: {
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              worldBoss: {
                select: {
                  id: true,
                  name: true,
                  tier: true,
                  map: {
                    select: {
                      id: true,
                      name: true,
                      tier: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),

      this.prisma.gameMap.findMany({
        where: {
          minLevel: {
            lte: character.level,
          },
        },
        orderBy: [
          {
            tier: 'asc',
          },
          {
            minLevel: 'asc',
          },
          {
            name: 'asc',
          },
        ],
        select: {
          id: true,
          name: true,
          tier: true,
          minLevel: true,
          maxLevel: true,
          description: true,
        },
      }),

      this.prisma.gameMap.findFirst({
        where: {
          minLevel: {
            lte: character.level,
          },
          maxLevel: {
            gte: character.level,
          },
        },
        orderBy: [
          {
            tier: 'desc',
          },
          {
            minLevel: 'desc',
          },
          {
            name: 'asc',
          },
        ],
        select: {
          id: true,
          name: true,
          tier: true,
          minLevel: true,
          maxLevel: true,
          description: true,
        },
      }),

      this.prisma.gameMap.findFirst({
        where: {
          minLevel: {
            lte: character.level,
          },
        },
        orderBy: [
          {
            tier: 'desc',
          },
          {
            minLevel: 'desc',
          },
          {
            name: 'asc',
          },
        ],
        select: {
          id: true,
          name: true,
          tier: true,
          minLevel: true,
          maxLevel: true,
          description: true,
        },
      }),

      this.prisma.subMap.count({
        where: {
          minLevel: {
            lte: character.level,
          },
        },
      }),

      this.hasCraftableRecipes(character.id, character.classId),

      this.getCharacterGatheringSkillsViewModel(
        character.id,
        character.class.name,
      ),
    ]);

    const stats = calculateFullStats(
      character.class,
      equipmentItems,
      character.level,
      gatheringSkills.totalStatBonus,
    );

    const calculatedMaxHp = stats.derivedCombatStats.maxHp;

    const currentHp =
      character.currentHp === null || character.currentHp === undefined
        ? calculatedMaxHp
        : this.clampHp(character.currentHp, calculatedMaxHp);

    const missingHp = Math.max(0, calculatedMaxHp - currentHp);

    const hasActiveAutoCombat = Boolean(activeAutoCombatSession);
    const hasActiveGathering = Boolean(activeGatheringSession);
    const hasActiveIncursion = Boolean(activeIncursionSession);
    const hasActiveWorldBoss = Boolean(activeWorldBossParticipation);

    const formattedActiveAutoCombatSession = activeAutoCombatSession
      ? this.formatActiveAutoCombatSession(activeAutoCombatSession)
      : null;

    const autoCombatPreview = activeAutoCombatSession
      ? this.buildAutoCombatPreview(activeAutoCombatSession)
      : null;

    const activeGatheringSkill =
      activeGatheringSession && activeGatheringSession.origin
        ? (gatheringSkills.byOrigin[activeGatheringSession.origin] ?? null)
        : null;

    const gatheringProductionPreview = activeGatheringSession
      ? this.buildGatheringProductionPreview(
          activeGatheringSession,
          activeGatheringSkill,
          isPremiumActive(character.user),
        )
      : null;

    const characterIsActive = character.status === CharacterStatus.ACTIVE;

    const characterCanAct =
      characterIsActive &&
      currentHp > 0 &&
      !hasActiveAutoCombat &&
      !hasActiveGathering &&
      !hasActiveIncursion &&
      !hasActiveWorldBoss;

    const canUseInfirmary =
      !hasActiveAutoCombat &&
      !hasActiveGathering &&
      !hasActiveIncursion &&
      !hasActiveWorldBoss &&
      character.status !== CharacterStatus.BLOCKED &&
      missingHp > 0;

    const canStartAutoCombat = characterCanAct && availableSubMapCount > 0;

    const canStartGathering = characterCanAct && availableMaps.length > 0;

    const recommendedMap = recommendedMapByLevelRange ?? fallbackRecommendedMap;

    return {
      character: {
        id: character.id,
        name: character.name,
        level: character.level,
        xp: character.xp,
        status: character.status,
        gold: character.gold,
        cash: character.cash,
        wallet: {
          gold: character.gold,
          cash: character.cash,
        },
        currencies: {
          gold: character.gold,
          cash: character.cash,
        },
        currentHp,
        maxHp: calculatedMaxHp,
        avatarKey: this.getCharacterAvatarKey(character),
        deletedAt: character.deletedAt,
        class: {
          id: character.class.id,
          name: character.class.name,
          description: character.class.description,
        },
        map: character.map ? this.formatMap(character.map) : null,
        currentMap: character.map ? this.formatMap(character.map) : null,
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,

        potionConfig: autoPotionConfig,
        potionConfigs: autoPotionConfig ? [autoPotionConfig] : [],
        autoPotionConfig,

        inventorySummary: this.buildInventorySummary(character.inventoryItems),

        gatheringSkills: gatheringSkills.skills,
        gathering: gatheringSkills,

        ...this.buildCharacterXpPayload(character.level, character.xp),
      },

      stats: {
        strength: stats.totalPrimaryStats.strength,
        vitality: stats.totalPrimaryStats.vitality,
        agility: stats.totalPrimaryStats.agility,
        precision: stats.totalPrimaryStats.precision,
        technique: stats.totalPrimaryStats.technique,
        willpower: stats.totalPrimaryStats.willpower,
        attack: stats.derivedCombatStats.attack,
        defense: stats.derivedCombatStats.defense,
        speed: stats.derivedCombatStats.speed,
        maxHp: stats.derivedCombatStats.maxHp,
        gatheringBonus: gatheringSkills.totalStatBonus,
        detail: {
          base: stats.basePrimaryStats,
          levelBonus: stats.levelBonusStats,
          equipmentBonus: stats.equipmentBonusStats,
          gatheringBonus: gatheringSkills.totalStatBonus,
          total: stats.totalPrimaryStats,
          derived: stats.derivedCombatStats,
        },
      },

      equipment: this.buildEquipmentResponse(character.equipment),

      gatheringSkills: gatheringSkills.skills,
      gathering: gatheringSkills,

      activity: {
        hasActiveAutoCombat,
        hasActiveGathering,
        hasActiveIncursion,
        hasActiveWorldBoss,

        activeAutoCombatSession: formattedActiveAutoCombatSession
          ? {
              ...formattedActiveAutoCombatSession,
              combatPreview: autoCombatPreview,
            }
          : null,

        activeGatheringSession: activeGatheringSession
          ? {
              ...activeGatheringSession,
              gatheringSkill: activeGatheringSkill,
              productionPreview: gatheringProductionPreview,
            }
          : null,

        activeIncursionSession: activeIncursionSession
          ? this.formatActiveIncursionSession(activeIncursionSession)
          : null,

        activeWorldBossParticipation: activeWorldBossParticipation ?? null,
      },

      progression: {
        currentMap: character.map ? this.formatMap(character.map) : null,
        availableMaps: availableMaps.map((map) => this.formatMap(map)),
        recommendedMap: recommendedMap ? this.formatMap(recommendedMap) : null,
      },

      shortcuts: {
        canUseInfirmary,
        canStartAutoCombat,
        canStartGathering,
        hasCraftableRecipes,
      },
    };
  }

  private formatActiveIncursionSession(session: any) {
    const now = new Date();
    const totalMs = Math.max(
      1,
      session.endsAt.getTime() - session.startedAt.getTime(),
    );
    const elapsedMs = Math.max(
      0,
      Math.min(totalMs, now.getTime() - session.startedAt.getTime()),
    );
    const effectiveStatus =
      session.status === IncursionSessionStatus.ACTIVE &&
      session.endsAt.getTime() <= now.getTime()
        ? IncursionSessionStatus.COMPLETED
        : session.status;

    return {
      ...session,
      status: effectiveStatus,
      progressPercent: Math.round((elapsedMs / totalMs) * 100),
      remainingSeconds: Math.max(
        0,
        Math.ceil((session.endsAt.getTime() - now.getTime()) / 1000),
      ),
      canClaim: false,
    };
  }

  async deleteMine(userId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId,
        deletedAt: null,
      },
      include: {
        class: true,
        autoCombatSessions: {
          where: {
            status: AutoCombatSessionStatus.ACTIVE,
          },
          select: {
            id: true,
            status: true,
            startedAt: true,
            endsAt: true,
          },
        },
        gatheringSessions: {
          where: {
            status: ActivityStatus.ACTIVE,
          },
          select: {
            id: true,
            status: true,
            startedAt: true,
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    if (character.autoCombatSessions.length > 0) {
      throw new BadRequestException(
        'Não é possível excluir personagem com auto-combate ativo. Encerre o auto-combate antes de excluir.',
      );
    }

    if (character.gatheringSessions.length > 0) {
      throw new BadRequestException(
        'Não é possível excluir personagem com gathering ativo. Encerre a coleta antes de excluir.',
      );
    }

    const deletedCharacter = await this.prisma.character.update({
      where: {
        id: character.id,
      },
      data: {
        status: CharacterStatus.DELETED,
        deletedAt: new Date(),
      },
      include: {
        class: true,
        map: true,
      },
    });

    return {
      message: 'Personagem excluído com sucesso.',
      character: {
        id: deletedCharacter.id,
        name: deletedCharacter.name,
        status: deletedCharacter.status,
        level: deletedCharacter.level,
        xp: deletedCharacter.xp,
        currentHp: deletedCharacter.currentHp,
        maxHp: deletedCharacter.maxHp,
        avatarKey: this.getCharacterAvatarKey(deletedCharacter),
        deletedAt: deletedCharacter.deletedAt,
        class: {
          id: deletedCharacter.class.id,
          name: deletedCharacter.class.name,
        },
        map: deletedCharacter.map ? this.formatMap(deletedCharacter.map) : null,
        ...this.buildCharacterXpPayload(
          deletedCharacter.level,
          deletedCharacter.xp,
        ),
      },
    };
  }

  private async hasCraftableRecipes(
    characterId: string,
    characterClassId: string,
  ) {
    const [inventoryItems, recipes] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          characterId,
        },
        select: {
          itemId: true,
          quantity: true,
        },
      }),

      this.prisma.craftingRecipe.findMany({
        where: {
          isActive: true,
        },
        include: {
          outputItem: {
            select: {
              id: true,
              classId: true,
              slot: true,
              isCraftable: true,
            },
          },
          ingredients: {
            select: {
              itemId: true,
              quantity: true,
            },
          },
        },
      }),
    ]);

    const inventoryByItemId = new Map(
      inventoryItems.map((inventoryItem) => [
        inventoryItem.itemId,
        inventoryItem.quantity,
      ]),
    );

    return recipes.some((recipe) => {
      if (!recipe.outputItem.isCraftable) {
        return false;
      }

      if (recipe.outputItem.slot === ItemSlot.MATERIAL) {
        return false;
      }

      if (
        recipe.outputItem.classId !== null &&
        recipe.outputItem.classId !== characterClassId
      ) {
        return false;
      }

      if (recipe.ingredients.length === 0) {
        return false;
      }

      return recipe.ingredients.every((ingredient) => {
        const available = inventoryByItemId.get(ingredient.itemId) ?? 0;

        return available >= ingredient.quantity;
      });
    });
  }

  private async getCharacterGatheringSkillsViewModel(
    characterId: string,
    className: string,
  ) {
    await this.ensureCharacterGatheringSkills(characterId);

    const skills = await this.prisma.characterGatheringSkill.findMany({
      where: {
        characterId,
        origin: {
          in: [...GATHERING_ORIGINS],
        },
      },
      orderBy: {
        origin: 'asc',
      },
    });

    const classSlug = this.getClassSlug(className);
    const affinities = CLASS_GATHERING_AFFINITIES[classSlug] ?? [];

    const byOrigin: Record<string, any> = {};
    const totalStatBonus = {
      strength: 0,
      vitality: 0,
      agility: 0,
      precision: 0,
      technique: 0,
      willpower: 0,
    };

    const viewModels = GATHERING_ORIGINS.map((origin) => {
      const skill =
        skills.find((currentSkill) => currentSkill.origin === origin) ?? null;

      const level = skill?.level ?? 1;
      const xp = skill?.xp ?? 0;
      const totalXp = skill?.totalXp ?? 0;
      const xpToNextLevel = this.getGatheringXpToNextLevel(level);
      const statInfo = ORIGIN_STAT_INFO[origin];
      const statBonusAmount = this.getGatheringStatBonus(level);
      const isClassAffinity = affinities.includes(origin);
      const productionMultiplier = this.getGatheringRateMultiplier(level);
      const productionBonusPercent = Math.round(
        (productionMultiplier - 1) * 100,
      );

      totalStatBonus[statInfo.stat] += statBonusAmount;

      const viewModel = {
        id: skill?.id ?? null,
        characterId,
        origin,
        level,
        xp,
        totalXp,
        xpToNextLevel,
        xpProgressPercent: this.getGatheringXpProgressPercent(
          xp,
          xpToNextLevel,
        ),
        isAtLevelCap: level >= GATHERING_LEVEL_CAP,
        isClassAffinity,
        statBonus: {
          stat: statInfo.stat,
          label: statInfo.label,
          amount: statBonusAmount,
        },
        productionMultiplier,
        productionBonusPercent,
        affinityBonus: isClassAffinity
          ? {
              xpMultiplier: GATHERING_AFFINITY_XP_MULTIPLIER,
              productionMultiplier: GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
            }
          : null,
      };

      byOrigin[origin] = viewModel;

      return viewModel;
    });

    return {
      skills: viewModels,
      byOrigin,
      affinities,
      className,
      classSlug,
      totalStatBonus,
      rules: {
        levelCap: GATHERING_LEVEL_CAP,
        statBonusPerLevel: GATHERING_STAT_BONUS_PER_LEVEL,
        productionBonusPerLevel: GATHERING_PRODUCTION_BONUS_PER_LEVEL,
        affinityXpMultiplier: GATHERING_AFFINITY_XP_MULTIPLIER,
        affinityProductionMultiplier: GATHERING_AFFINITY_PRODUCTION_MULTIPLIER,
      },
    };
  }

  private async ensureCharacterGatheringSkills(characterId: string) {
    await Promise.all(
      GATHERING_ORIGINS.map((origin) =>
        this.prisma.characterGatheringSkill.upsert({
          where: {
            characterId_origin: {
              characterId,
              origin,
            },
          },
          update: {},
          create: {
            characterId,
            origin,
            level: 1,
            xp: 0,
            totalXp: 0,
          },
        }),
      ),
    );
  }

  private getGatheringXpToNextLevel(level: number) {
    return getGatheringXpToNextLevel(level);
  }

  private getGatheringRateMultiplier(level: number) {
    return getGatheringRateMultiplier(level);
  }

  private getGatheringStatBonus(level: number) {
    return getGatheringStatBonus(level);
  }

  private getGatheringXpProgressPercent(
    xp: number,
    xpToNextLevel: number | null,
  ) {
    return getGatheringXpProgressPercent(xp, xpToNextLevel);
  }

  private formatActiveAutoCombatSession(activeAutoCombatSession: any) {
    const activeMap =
      activeAutoCombatSession.map ?? activeAutoCombatSession.subMap?.map ?? null;
    const formattedActiveMap = activeMap ? this.formatMap(activeMap) : null;
    const formattedSubMap = activeAutoCombatSession.subMap
      ? {
          ...activeAutoCombatSession.subMap,
          map: formattedActiveMap ?? activeAutoCombatSession.subMap.map ?? null,
        }
      : null;
    const currentMobMaxHp =
      activeAutoCombatSession.currentMobMaxHp ??
      activeAutoCombatSession.currentMob?.hp ??
      null;

    const currentMobHp =
      activeAutoCombatSession.currentMobHp ?? currentMobMaxHp ?? null;

    const currentMob =
      activeAutoCombatSession.currentMob && currentMobMaxHp !== null
        ? {
            ...activeAutoCombatSession.currentMob,
            currentHp: this.clampHp(
              currentMobHp ?? currentMobMaxHp,
              currentMobMaxHp,
            ),
            maxHp: currentMobMaxHp,
            hpPercent:
              currentMobMaxHp > 0
                ? Number(
                    (
                      (this.clampHp(
                        currentMobHp ?? currentMobMaxHp,
                        currentMobMaxHp,
                      ) /
                        currentMobMaxHp) *
                      100
                    ).toFixed(2),
                  )
                : 0,
          }
        : activeAutoCombatSession.currentMob
          ? {
              ...activeAutoCombatSession.currentMob,
              currentHp: null,
              maxHp: null,
              hpPercent: null,
            }
          : null;

    const totalKills = (activeAutoCombatSession.mobSummaries ?? []).reduce(
      (total: number, summary: { kills?: number | null }) => {
        return total + (summary.kills ?? 0);
      },
      0,
    );

    return {
      ...activeAutoCombatSession,
      mapId: activeAutoCombatSession.mapId ?? activeMap?.id ?? null,
      subMapId: activeAutoCombatSession.subMapId ?? formattedSubMap?.id ?? null,
      map: formattedActiveMap,
      subMap: formattedSubMap,
      totalKills,
      currentMobHp,
      currentMobMaxHp,
      currentMob,
    };
  }

  private buildAutoCombatPreview(activeAutoCombatSession: any) {
    const now = new Date();
    const activeMap =
      activeAutoCombatSession.map ?? activeAutoCombatSession.subMap?.map ?? null;
    const formattedActiveMap = activeMap ? this.formatMap(activeMap) : null;

    const startedAt = new Date(activeAutoCombatSession.startedAt);

    const lastProcessedAt = activeAutoCombatSession.lastProcessedAt
      ? new Date(activeAutoCombatSession.lastProcessedAt)
      : startedAt;

    const endsAt = activeAutoCombatSession.endsAt
      ? new Date(activeAutoCombatSession.endsAt)
      : null;

    const elapsedTotalSeconds = Math.max(
      0,
      Math.floor((now.getTime() - startedAt.getTime()) / 1000),
    );

    const elapsedSinceLastProcessSeconds = Math.max(
      0,
      Math.floor((now.getTime() - lastProcessedAt.getTime()) / 1000),
    );

    const durationSeconds = activeAutoCombatSession.durationSeconds ?? null;

    const roundDurationSeconds =
      activeAutoCombatSession.roundDurationSeconds ??
      AUTO_COMBAT_ROUND_DURATION_SECONDS;

    const remainingSeconds = endsAt
      ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000))
      : null;

    const isFinishedByTime = endsAt ? now >= endsAt : false;

    const estimatedRoundsReadyToProcess =
      roundDurationSeconds <= 0
        ? 0
        : Math.floor(elapsedSinceLastProcessSeconds / roundDurationSeconds);

    const estimatedCombatsReadyToResolve = estimatedRoundsReadyToProcess;

    const secondsIntoCurrentRound =
      roundDurationSeconds <= 0
        ? 0
        : elapsedSinceLastProcessSeconds % roundDurationSeconds;

    const progressToNextRoundPercent =
      roundDurationSeconds <= 0
        ? 0
        : Number(
            ((secondsIntoCurrentRound / roundDurationSeconds) * 100).toFixed(2),
          );

    const nextRoundRemainingSeconds =
      roundDurationSeconds <= 0
        ? 0
        : Math.max(0, roundDurationSeconds - secondsIntoCurrentRound);

    const currentMobMaxHp =
      activeAutoCombatSession.currentMobMaxHp ??
      activeAutoCombatSession.currentMob?.hp ??
      null;

    const currentMobHp =
      activeAutoCombatSession.currentMobHp ?? currentMobMaxHp ?? null;

    const currentMob =
      activeAutoCombatSession.currentMob && currentMobMaxHp !== null
        ? {
            id: activeAutoCombatSession.currentMob.id,
            name: activeAutoCombatSession.currentMob.name,
            level: activeAutoCombatSession.currentMob.level,
            tier: activeAutoCombatSession.currentMob.tier,
            hp: activeAutoCombatSession.currentMob.hp,
            attack: activeAutoCombatSession.currentMob.attack,
            defense: activeAutoCombatSession.currentMob.defense,
            speed: activeAutoCombatSession.currentMob.speed,
            xpReward: activeAutoCombatSession.currentMob.xpReward,
            currentHp: this.clampHp(
              currentMobHp ?? currentMobMaxHp,
              currentMobMaxHp,
            ),
            maxHp: currentMobMaxHp,
            hpPercent:
              currentMobMaxHp > 0
                ? Number(
                    (
                      (this.clampHp(
                        currentMobHp ?? currentMobMaxHp,
                        currentMobMaxHp,
                      ) /
                        currentMobMaxHp) *
                      100
                    ).toFixed(2),
                  )
                : 0,
          }
        : null;

    const totalKills = (activeAutoCombatSession.mobSummaries ?? []).reduce(
      (total: number, summary: { kills?: number | null }) => {
        return total + (summary.kills ?? 0);
      },
      0,
    );

    return {
      label: activeAutoCombatSession.subMap
        ? `Combatendo em ${activeAutoCombatSession.subMap.name}`
        : 'Auto-combate em andamento',

      currentMobId: activeAutoCombatSession.currentMobId ?? null,
      currentMobHp,
      currentMobMaxHp,
      currentMob,
      currentRound: activeAutoCombatSession.currentRound ?? null,
      currentCombatIndex: activeAutoCombatSession.currentCombatIndex ?? null,

      subMap: activeAutoCombatSession.subMap
        ? {
            id: activeAutoCombatSession.subMap.id,
            name: activeAutoCombatSession.subMap.name,
            tier: activeAutoCombatSession.subMap.tier,
            minLevel: activeAutoCombatSession.subMap.minLevel,
            maxLevel: activeAutoCombatSession.subMap.maxLevel,
            map: formattedActiveMap,
          }
        : null,

      map: formattedActiveMap,

      elapsedTotalSeconds,
      elapsedTotalMinutes: Math.floor(elapsedTotalSeconds / 60),

      elapsedSinceLastProcessSeconds,
      elapsedSinceLastProcessMinutes: Math.floor(
        elapsedSinceLastProcessSeconds / 60,
      ),

      durationSeconds,
      durationMinutes:
        durationSeconds === null ? null : Math.floor(durationSeconds / 60),

      remainingSeconds,
      remainingMinutes:
        remainingSeconds === null ? null : Math.floor(remainingSeconds / 60),

      roundDurationSeconds,

      estimatedRoundsReadyToProcess,
      estimatedCombatsReadyToResolve,

      canProcessNow: estimatedRoundsReadyToProcess > 0 || isFinishedByTime,

      progressToNextRoundPercent,
      nextRoundRemainingSeconds,
      nextRoundRemainingMinutes: Math.floor(nextRoundRemainingSeconds / 60),

      totals: {
        kills: totalKills,
        totalKills,
        combatsResolved: activeAutoCombatSession.totalCombatsResolved ?? 0,
        roundsResolved: activeAutoCombatSession.totalRoundsResolved ?? 0,
        xpGained: activeAutoCombatSession.totalXpGained ?? 0,
      },

      timestamps: {
        startedAt: activeAutoCombatSession.startedAt,
        lastProcessedAt: activeAutoCombatSession.lastProcessedAt,
        endsAt: activeAutoCombatSession.endsAt,
      },

      isFinishedByTime,
    };
  }

  private buildGatheringProductionPreview(
    activeGatheringSession: any,
    gatheringSkill?: any | null,
    isPremium = false,
  ) {
    const now = new Date();
    const idleProgressLimitSeconds = getIdleProgressLimitSeconds(isPremium);

    const lastResolvedAt =
      activeGatheringSession.lastResolvedAt ?? activeGatheringSession.startedAt;

    const progressRemainder = Number(
      activeGatheringSession.progressRemainder ?? 0,
    );

    const rawElapsedSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(lastResolvedAt).getTime()) / 1000),
    );
    const elapsedSeconds = Math.min(
      rawElapsedSeconds,
      idleProgressLimitSeconds,
    );

    const defaultReward = calculateGatheringReward({
      elapsedSeconds,
      tier: activeGatheringSession.map.tier,
      progressRemainder,
      maxElapsedSeconds: idleProgressLimitSeconds,
    });

    const defaultRatePerHour = Math.max(1, defaultReward.ratePerHour);

    const materialBaseRate =
      activeGatheringSession.targetMaterial.baseGatheringRatePerHour &&
      activeGatheringSession.targetMaterial.baseGatheringRatePerHour > 0
        ? activeGatheringSession.targetMaterial.baseGatheringRatePerHour
        : defaultRatePerHour;

    const skillMultiplier =
      gatheringSkill?.productionMultiplier &&
      gatheringSkill.productionMultiplier > 0
        ? gatheringSkill.productionMultiplier
        : 1;

    const affinityMultiplier = gatheringSkill?.isClassAffinity
      ? GATHERING_AFFINITY_PRODUCTION_MULTIPLIER
      : 1;

    const finalRateMultiplier =
      (materialBaseRate / defaultRatePerHour) *
      skillMultiplier *
      affinityMultiplier;

    const reward = calculateGatheringReward({
      elapsedSeconds,
      tier: activeGatheringSession.map.tier,
      progressRemainder,
      rateMultiplier: finalRateMultiplier,
      maxElapsedSeconds: idleProgressLimitSeconds,
    });

    const finalRatePerHour = Number(
      (materialBaseRate * skillMultiplier * affinityMultiplier).toFixed(4),
    );

    return {
      label: `Coletando ${activeGatheringSession.targetMaterial.name}`,

      material: {
        id: activeGatheringSession.targetMaterial.id,
        name: activeGatheringSession.targetMaterial.name,
        tier: activeGatheringSession.targetMaterial.tier,
        rarity: activeGatheringSession.targetMaterial.rarity,
        family: activeGatheringSession.targetMaterial.family,
        materialOrigin: activeGatheringSession.targetMaterial.materialOrigin,
        requiredGatheringLevel:
          activeGatheringSession.targetMaterial.requiredGatheringLevel ?? 1,
        gatheringXpPerUnit: getGatheringXpPerUnitForTier(
          activeGatheringSession.targetMaterial.tier,
        ),
        baseGatheringRatePerHour:
          activeGatheringSession.targetMaterial.baseGatheringRatePerHour ??
          null,
      },

      map: {
        id: activeGatheringSession.map.id,
        name: activeGatheringSession.map.name,
        tier: activeGatheringSession.map.tier,
      },

      gatheringSkill: gatheringSkill ?? null,

      elapsedSeconds,
      elapsedMinutes: Math.floor(elapsedSeconds / 60),
      elapsedHours: Number(reward.elapsedHours.toFixed(4)),

      ratePerHour: finalRatePerHour,
      baseRatePerHour: materialBaseRate,
      defaultRatePerHour,
      skillRateMultiplier: skillMultiplier,
      affinityRateMultiplier: affinityMultiplier,
      finalRateMultiplier: Number(finalRateMultiplier.toFixed(4)),

      estimatedQuantityToCollect: reward.quantity,
      canCollectNow: reward.quantity > 0,

      currentProgressRemainder: Number(progressRemainder.toFixed(4)),
      estimatedNewProgressRemainder: Number(
        reward.newProgressRemainder.toFixed(4),
      ),
      nextUnitProgressPercent: Number(
        (reward.newProgressRemainder * 100).toFixed(2),
      ),
    };
  }

  private buildPotionConfigResponse(config: any, inventoryItems: any[] = []) {
    if (!config) {
      return null;
    }

    const potionItem = config.potionItem ?? null;
    const availableQuantity = potionItem
      ? this.getInventoryQuantityForItem(inventoryItems, potionItem.id)
      : 0;

    const potion = potionItem
      ? this.mapPotionItem(potionItem, availableQuantity)
      : null;

    return {
      id: config.id,
      characterId: config.characterId,
      enabled: config.enabled,
      potionItemId: config.potionItemId,
      hpThresholdPercent: config.hpThresholdPercent,
      useInManualCombat: config.useInManualCombat,
      useInAutoCombat: config.useInAutoCombat,
      potion,
      potionItem: potion,
      summary: {
        hasPotion: Boolean(potion),
        hasPotionInInventory: availableQuantity > 0,
        availableQuantity,
        canAutoUseInManualCombat:
          config.enabled &&
          config.useInManualCombat &&
          Boolean(potion) &&
          availableQuantity > 0 &&
          potion?.usableInCombat === true,
        canAutoUseInAutoCombat:
          config.enabled &&
          config.useInAutoCombat &&
          Boolean(potion) &&
          availableQuantity > 0 &&
          potion?.usableInCombat === true,
        canAutoUse:
          config.enabled &&
          Boolean(potion) &&
          availableQuantity > 0 &&
          potion?.usableInCombat === true &&
          (config.useInManualCombat || config.useInAutoCombat),
        triggerText: config.enabled
          ? `Usar automaticamente quando HP estiver em ${config.hpThresholdPercent}% ou menos.`
          : 'Uso automático desativado.',
      },
    };
  }

  private mapPotionItem(item: Item, availableQuantity = 0) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      rarity: item.rarity,
      tier: item.tier,
      slot: item.slot,
      family: item.family,
      healFlat: item.healFlat,
      healPercent: item.healPercent,
      usableInCombat: item.usableInCombat,
      usableOutOfCombat: item.usableOutOfCombat,
      minTier: item.minTier,
      maxTier: item.maxTier,
      isSellable: item.isSellable,
      isTradable: item.isTradable,
      availableQuantity,
    };
  }

  private getInventoryQuantityForItem(inventoryItems: any[], itemId: string) {
    const inventoryItem = inventoryItems.find((currentInventoryItem) => {
      return currentInventoryItem.itemId === itemId;
    });

    return inventoryItem?.quantity ?? 0;
  }

  private buildStatsResponse(stats: any, gatheringBonus?: any) {
    const gatheringBonusStats = gatheringBonus ??
      stats.gatheringBonusStats ?? {
        strength: 0,
        vitality: 0,
        agility: 0,
        precision: 0,
        technique: 0,
        willpower: 0,
      };

    return {
      primary: {
        base: stats.basePrimaryStats,
        levelBonus: stats.levelBonusStats,
        equipmentBonus: stats.equipmentBonusStats,
        gatheringBonus: gatheringBonusStats,
        total: stats.totalPrimaryStats,
      },
      combat: stats.derivedCombatStats,
      basePrimaryStats: stats.basePrimaryStats,
      levelBonusStats: stats.levelBonusStats,
      equipmentBonusStats: stats.equipmentBonusStats,
      gatheringBonusStats,
      totalPrimaryStats: stats.totalPrimaryStats,
      derivedCombatStats: stats.derivedCombatStats,
    };
  }

  private buildEquipmentResponse(equipment: any) {
    if (!equipment) {
      return {
        mainHand: null,
        offHand: null,
        head: null,
        armor: null,
        pants: null,
        boots: null,
      };
    }

    return {
      id: equipment.id,
      characterId: equipment.characterId,
      mainHand: this.mapEquipmentItem(equipment.mainHand),
      offHand: this.mapEquipmentItem(equipment.offHand),
      head: this.mapEquipmentItem(equipment.head),
      armor: this.mapEquipmentItem(equipment.armor),
      pants: this.mapEquipmentItem(equipment.pants),
      boots: this.mapEquipmentItem(equipment.boots),
      createdAt: equipment.createdAt,
      updatedAt: equipment.updatedAt,
    };
  }

  private mapEquipmentItem(item: any) {
    if (!item) {
      return null;
    }

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      tier: item.tier,
      rarity: item.rarity,
      slot: item.slot,
      family: item.family,
      classId: item.classId,
      mapId: item.mapId,
      strengthBonus: item.strengthBonus,
      vitalityBonus: item.vitalityBonus,
      agilityBonus: item.agilityBonus,
      precisionBonus: item.precisionBonus,
      techniqueBonus: item.techniqueBonus,
      willpowerBonus: item.willpowerBonus,
      isCraftable: item.isCraftable,
    };
  }

  private buildInventorySummary(inventoryItems: any[]) {
    return {
      totalItems: inventoryItems.length,
      totalQuantity: inventoryItems.reduce(
        (total, inventoryItem) => total + inventoryItem.quantity,
        0,
      ),

      materials: inventoryItems
        .filter(
          (inventoryItem) => inventoryItem.item.slot === ItemSlot.MATERIAL,
        )
        .map((inventoryItem) => ({
          id: inventoryItem.item.id,
          itemId: inventoryItem.item.id,
          inventoryItemId: inventoryItem.id,
          name: inventoryItem.item.name,
          description: inventoryItem.item.description,
          quantity: inventoryItem.quantity,
          slot: inventoryItem.item.slot,
          rarity: inventoryItem.item.rarity,
          tier: inventoryItem.item.tier,
          family: inventoryItem.item.family,
          materialOrigin: inventoryItem.item.materialOrigin,
          mapId: inventoryItem.item.mapId,
          requiredGatheringLevel:
            inventoryItem.item.requiredGatheringLevel ?? 1,
          gatheringXpPerUnit: inventoryItem.item.isGatheringMaterial
            ? getGatheringXpPerUnitForTier(inventoryItem.item.tier)
            : (inventoryItem.item.gatheringXpPerUnit ?? 1),
          baseGatheringRatePerHour:
            inventoryItem.item.baseGatheringRatePerHour ?? null,
        })),

      consumables: inventoryItems
        .filter(
          (inventoryItem) => inventoryItem.item.slot === ItemSlot.CONSUMABLE,
        )
        .map((inventoryItem) => ({
          id: inventoryItem.item.id,
          itemId: inventoryItem.item.id,
          inventoryItemId: inventoryItem.id,
          name: inventoryItem.item.name,
          description: inventoryItem.item.description,
          quantity: inventoryItem.quantity,
          slot: inventoryItem.item.slot,
          rarity: inventoryItem.item.rarity,
          tier: inventoryItem.item.tier,
          family: inventoryItem.item.family,
          healFlat: inventoryItem.item.healFlat,
          healPercent: inventoryItem.item.healPercent,
          usableInCombat: inventoryItem.item.usableInCombat,
          usableOutOfCombat: inventoryItem.item.usableOutOfCombat,
          minTier: inventoryItem.item.minTier,
          maxTier: inventoryItem.item.maxTier,
        })),

      equipment: inventoryItems
        .filter(
          (inventoryItem) =>
            inventoryItem.item.slot !== ItemSlot.MATERIAL &&
            inventoryItem.item.slot !== ItemSlot.CONSUMABLE,
        )
        .map((inventoryItem) => ({
          id: inventoryItem.item.id,
          itemId: inventoryItem.item.id,
          inventoryItemId: inventoryItem.id,
          name: inventoryItem.item.name,
          description: inventoryItem.item.description,
          quantity: inventoryItem.quantity,
          slot: inventoryItem.item.slot,
          rarity: inventoryItem.item.rarity,
          tier: inventoryItem.item.tier,
          family: inventoryItem.item.family,
          classId: inventoryItem.item.classId,
          mapId: inventoryItem.item.mapId,
          strengthBonus: inventoryItem.item.strengthBonus,
          vitalityBonus: inventoryItem.item.vitalityBonus,
          agilityBonus: inventoryItem.item.agilityBonus,
          precisionBonus: inventoryItem.item.precisionBonus,
          techniqueBonus: inventoryItem.item.techniqueBonus,
          willpowerBonus: inventoryItem.item.willpowerBonus,
        })),
    };
  }

  private getEquipmentItems(character: any) {
    return [
      character.equipment?.mainHand,
      character.equipment?.offHand,
      character.equipment?.head,
      character.equipment?.armor,
      character.equipment?.pants,
      character.equipment?.boots,
    ].filter(Boolean);
  }

  private getInventoryItemType(slot: ItemSlot) {
    if (slot === ItemSlot.MATERIAL) {
      return InventoryItemType.MATERIAL;
    }

    if (slot === ItemSlot.CONSUMABLE) {
      return InventoryItemType.CONSUMABLE;
    }

    return InventoryItemType.EQUIPMENT;
  }

  private formatMap(map: any) {
    return {
      id: map.id,
      name: map.name,
      tier: map.tier,
      minLevel: map.minLevel,
      maxLevel: map.maxLevel,
      description: map.description,
    };
  }

  private normalizeCharacterName(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }

  private normalizeClassName(className: string) {
    return className.trim().replace(/\s+/g, ' ');
  }

  private isValidCharacterName(name: string) {
    return /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ]+$/.test(name);
  }

  private clampHp(currentHp: number, maxHp: number) {
    return Math.max(0, Math.min(currentHp, maxHp));
  }

  private getStarterEquipmentBySlot(starterItems: Item[]) {
    return {
      mainHand: this.getRequiredStarterItemBySlot(
        starterItems,
        ItemSlot.MAIN_HAND,
      ),
      offHand: this.getRequiredStarterItemBySlot(
        starterItems,
        ItemSlot.OFF_HAND,
      ),
      head: this.getRequiredStarterItemBySlot(starterItems, ItemSlot.HEAD),
      armor: this.getRequiredStarterItemBySlot(starterItems, ItemSlot.ARMOR),
      pants: this.getRequiredStarterItemBySlot(starterItems, ItemSlot.PANTS),
      boots: this.getRequiredStarterItemBySlot(starterItems, ItemSlot.BOOTS),
    };
  }

  private getRequiredStarterItemBySlot(starterItems: Item[], slot: ItemSlot) {
    const item = starterItems.find((starterItem) => starterItem.slot === slot);

    if (!item) {
      throw new BadRequestException(
        `Item inicial Tier 0 não encontrado para o slot ${slot}. Rode o seed antes de criar personagens novos.`,
      );
    }

    return item;
  }

  private resolveAvatarKey(params: {
    requestedAvatarKey?: string;
    className: string;
  }) {
    const classSlug = this.getClassSlug(params.className);
    const requestedAvatarKey = params.requestedAvatarKey?.trim().toLowerCase();

    const allowedAvatarKeysByClass: Record<string, string[]> = {
      lutador: [
        'lutador-01',
        'lutador-02',
        'lutador-03',
        'lutador-04',
        'lutador-05',
        'lutador-06',
        'lutador-07',
        'lutador-08',
      ],
      assassino: [
        'assassino-01',
        'assassino-02',
        'assassino-03',
        'assassino-04',
        'assassino-05',
        'assassino-06',
        'assassino-07',
        'assassino-08',
      ],
      atirador: [
        'atirador-01',
        'atirador-02',
        'atirador-03',
        'atirador-04',
        'atirador-05',
        'atirador-06',
        'atirador-07',
        'atirador-08',
      ],
      medico: [
        'medico-01',
        'medico-02',
        'medico-03',
        'medico-04',
        'medico-05',
        'medico-06',
        'medico-07',
        'medico-08',
      ],
    };

    const defaultAvatarKeyByClass: Record<string, string> = {
      lutador: 'lutador-01',
      assassino: 'assassino-01',
      atirador: 'atirador-01',
      medico: 'medico-01',
    };

    const allowedAvatarKeys = allowedAvatarKeysByClass[classSlug];

    if (!allowedAvatarKeys) {
      throw new BadRequestException('Classe inválida para seleção de avatar.');
    }

    if (!requestedAvatarKey) {
      return defaultAvatarKeyByClass[classSlug];
    }

    if (!allowedAvatarKeys.includes(requestedAvatarKey)) {
      throw new BadRequestException(
        'Avatar inválido para a classe selecionada.',
      );
    }

    return requestedAvatarKey;
  }

  private getCharacterAvatarKey(character: {
    avatarKey?: string | null;
    class?: {
      name?: string | null;
    } | null;
  }) {
    if (character.avatarKey) {
      return character.avatarKey;
    }

    const className = character.class?.name;

    if (!className) {
      return 'lutador-01';
    }

    return this.resolveAvatarKey({
      className,
    });
  }

  private getClassSlug(className: string) {
    return className
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private buildCharacterXpPayload(
    characterLevel: number,
    characterXp: number,
  ): XpProgressSnapshot {
    const levelProgress = getLevelProgress(characterLevel, characterXp);

    const xpToNextLevel = this.getXpToNextLevelFromProgress(levelProgress);

    return {
      totalXp: levelProgress.totalXp,

      currentLevelXp: levelProgress.xpIntoCurrentLevel,
      xpToNextLevel,
      nextLevelXp: xpToNextLevel,
      xpProgressPercent: levelProgress.progressPercent,

      xpIntoCurrentLevel: levelProgress.xpIntoCurrentLevel,
      xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,
      currentLevelStartXp: levelProgress.currentLevelStartXp,
      nextLevelRequiredXp: levelProgress.nextLevelRequiredXp,
      isAtLevelCap: levelProgress.isAtLevelCap,

      levelProgress: {
        oldLevel: levelProgress.oldLevel,
        newLevel: levelProgress.newLevel,

        currentXp: levelProgress.currentXp,
        gainedXp: levelProgress.gainedXp,
        totalXp: levelProgress.totalXp,

        currentLevelXp: levelProgress.xpIntoCurrentLevel,
        xpToNextLevel,
        nextLevelXp: xpToNextLevel,
        xpProgressPercent: levelProgress.progressPercent,

        leveledUp: levelProgress.leveledUp,
        levelsGained: levelProgress.levelsGained,

        levelCap: levelProgress.levelCap,
        isAtLevelCap: levelProgress.isAtLevelCap,

        currentLevelStartXp: levelProgress.currentLevelStartXp,
        nextLevelRequiredXp: levelProgress.nextLevelRequiredXp,

        xpIntoCurrentLevel: levelProgress.xpIntoCurrentLevel,
        xpNeededForNextLevel: levelProgress.xpNeededForNextLevel,

        progressPercent: levelProgress.progressPercent,
      },
    };
  }

  private getXpToNextLevelFromProgress(levelProgress: {
    xpIntoCurrentLevel: number;
    xpNeededForNextLevel: number | null;
  }) {
    if (levelProgress.xpNeededForNextLevel === null) {
      return Math.max(1, levelProgress.xpIntoCurrentLevel);
    }

    return Math.max(1, levelProgress.xpNeededForNextLevel);
  }
}
