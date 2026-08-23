import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterStatus,
  type Friendship,
  FriendshipStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CosmeticsService } from '../cosmetics/cosmetics.service';
import {
  GATHERING_RANKING_ORIGINS,
  SOCIAL_RANKING_LABELS,
  type SocialRankingCategory,
} from './social.constants';

const socialCharacterSelect = {
  id: true,
  name: true,
  level: true,
  avatarKey: true,
  class: { select: { id: true, name: true } },
  map: { select: { id: true, name: true, tier: true } },
} satisfies Prisma.CharacterSelect;

const searchCharacterSelect = {
  ...socialCharacterSelect,
  userId: true,
} satisfies Prisma.CharacterSelect;

const friendInclude = {
  requester: {
    select: {
      id: true,
      characters: {
        where: { deletedAt: null, status: CharacterStatus.ACTIVE },
        orderBy: [{ level: 'desc' }, { xp: 'desc' }, { createdAt: 'asc' }],
        select: socialCharacterSelect,
      },
    },
  },
  addressee: {
    select: {
      id: true,
      characters: {
        where: { deletedAt: null, status: CharacterStatus.ACTIVE },
        orderBy: [{ level: 'desc' }, { xp: 'desc' }, { createdAt: 'asc' }],
        select: socialCharacterSelect,
      },
    },
  },
} satisfies Prisma.FriendshipInclude;

const publicSocialUserWhere = {
  isSuspended: false,
  NOT: [
    { email: { endsWith: '@local.test', mode: 'insensitive' } },
    { email: { endsWith: '@dead-idle.test', mode: 'insensitive' } },
  ],
} satisfies Prisma.UserWhereInput;

const rankableCharacterWhere = {
  deletedAt: null,
  status: CharacterStatus.ACTIVE,
  user: publicSocialUserWhere,
} satisfies Prisma.CharacterWhereInput;

type FriendshipWithUsers = Prisma.FriendshipGetPayload<{
  include: typeof friendInclude;
}>;

type SocialCharacter = Prisma.CharacterGetPayload<{
  select: typeof socialCharacterSelect;
}>;

type RankingCandidate = {
  character: SocialCharacter;
  score: {
    level: number;
    xp: number;
    totalXp: number;
  };
};

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosmeticsService: CosmeticsService,
  ) {}

  async getPublicCharacterProfile(viewerUserId: string, characterId: string) {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        deletedAt: null,
        user: { isSuspended: false },
      },
      select: {
        id: true,
        userId: true,
        name: true,
        level: true,
        status: true,
        avatarKey: true,
        createdAt: true,
        class: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        map: {
          select: {
            id: true,
            name: true,
            tier: true,
          },
        },
        equipment: {
          select: {
            mainHand: {
              select: {
                id: true,
                name: true,
                tier: true,
                rarity: true,
                slot: true,
              },
            },
            offHand: {
              select: {
                id: true,
                name: true,
                tier: true,
                rarity: true,
                slot: true,
              },
            },
            head: {
              select: {
                id: true,
                name: true,
                tier: true,
                rarity: true,
                slot: true,
              },
            },
            armor: {
              select: {
                id: true,
                name: true,
                tier: true,
                rarity: true,
                slot: true,
              },
            },
            pants: {
              select: {
                id: true,
                name: true,
                tier: true,
                rarity: true,
                slot: true,
              },
            },
            boots: {
              select: {
                id: true,
                name: true,
                tier: true,
                rarity: true,
                slot: true,
              },
            },
          },
        },
      },
    });

    if (!character) {
      throw new NotFoundException('Personagem não encontrado.');
    }

    const { userId, ...publicCharacter } = character;

    return {
      character: publicCharacter,
      appearance: await this.cosmeticsService.getResolvedAppearance(
        character.id,
      ),
      viewer: {
        isOwner: userId === viewerUserId,
      },
    };
  }

  async list(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      orderBy: { updatedAt: 'desc' },
      include: friendInclude,
    });
    const formatted = friendships.map((friendship) =>
      this.formatFriendship(friendship, userId),
    );
    const appearances = await this.cosmeticsService.getResolvedAppearances(
      formatted.flatMap(({ user }) =>
        user.characters.map((character) => character.id),
      ),
    );
    const withAppearances = formatted.map((friendship) => ({
      ...friendship,
      user: {
        ...friendship.user,
        characters: friendship.user.characters.map((character) => ({
          ...character,
          appearance: appearances[character.id] ?? null,
        })),
      },
    }));

    return {
      friends: withAppearances.filter(
        (friendship) => friendship.status === FriendshipStatus.ACCEPTED,
      ),
      incoming: withAppearances.filter(
        (friendship) =>
          friendship.status === FriendshipStatus.PENDING &&
          friendship.addresseeId === userId,
      ),
      outgoing: withAppearances.filter(
        (friendship) =>
          friendship.status === FriendshipStatus.PENDING &&
          friendship.requesterId === userId,
      ),
    };
  }

  async searchCharacters(userId: string, nickname: string) {
    const normalizedNickname = nickname.trim().replace(/\s+/g, ' ');
    const normalizedComparison = normalizedNickname.toLocaleLowerCase('pt-BR');
    const searchBaseWhere = {
      ...rankableCharacterWhere,
      userId: { not: userId },
    } satisfies Prisma.CharacterWhereInput;
    const [exactCandidates, partialCandidates] = await Promise.all([
      this.prisma.character.findMany({
        where: {
          ...searchBaseWhere,
          name: { equals: normalizedNickname, mode: 'insensitive' },
        },
        select: searchCharacterSelect,
        orderBy: [{ level: 'desc' }, { createdAt: 'asc' }],
        take: 12,
      }),
      this.prisma.character.findMany({
        where: {
          ...searchBaseWhere,
          name: { contains: normalizedNickname, mode: 'insensitive' },
        },
        select: searchCharacterSelect,
        orderBy: [{ level: 'desc' }, { name: 'asc' }, { createdAt: 'asc' }],
        take: 20,
      }),
    ]);
    const candidates = Array.from(
      new Map(
        [...exactCandidates, ...partialCandidates].map((candidate) => [
          candidate.id,
          candidate,
        ]),
      ).values(),
    );

    candidates.sort((left, right) => {
      const leftName = left.name.toLocaleLowerCase('pt-BR');
      const rightName = right.name.toLocaleLowerCase('pt-BR');
      const leftMatch = leftName === normalizedComparison ? 0 : 1;
      const rightMatch = rightName === normalizedComparison ? 0 : 1;
      const leftPrefix = leftName.startsWith(normalizedComparison) ? 0 : 1;
      const rightPrefix = rightName.startsWith(normalizedComparison) ? 0 : 1;

      return (
        leftMatch - rightMatch ||
        leftPrefix - rightPrefix ||
        right.level - left.level ||
        left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' })
      );
    });

    const results = candidates.slice(0, 12);
    const pairKeys = Array.from(
      new Set(
        results.map(({ userId: targetUserId }) =>
          this.pairKey(userId, targetUserId),
        ),
      ),
    );
    const friendshipsPromise: Promise<Friendship[]> = pairKeys.length
      ? this.prisma.friendship.findMany({
          where: { pairKey: { in: pairKeys } },
        })
      : Promise.resolve([]);
    const [friendships, appearances] = await Promise.all([
      friendshipsPromise,
      this.cosmeticsService.getResolvedAppearances(
        results.map((character) => character.id),
      ),
    ]);
    const friendshipByPair = new Map(
      friendships.map(
        (friendship) => [friendship.pairKey, friendship] as const,
      ),
    );

    return {
      query: normalizedNickname,
      results: results.map((candidate) => {
        const { userId: targetUserId, ...character } = candidate;
        const friendship = friendshipByPair.get(
          this.pairKey(userId, targetUserId),
        );

        return {
          character: {
            ...character,
            appearance: appearances[character.id] ?? null,
          },
          relationship: friendship
            ? {
                id: friendship.id,
                status: friendship.status,
                direction:
                  friendship.requesterId === userId ? 'OUTGOING' : 'INCOMING',
              }
            : null,
        };
      }),
    };
  }

  async sendRequest(userId: string, targetCharacterId: string) {
    const target = await this.prisma.character.findFirst({
      where: {
        id: targetCharacterId,
        ...rankableCharacterWhere,
      },
      select: { userId: true },
    });

    if (!target) {
      throw new NotFoundException('Sobrevivente não encontrado.');
    }
    if (target.userId === userId) {
      throw new ConflictException('Você não pode adicionar a própria conta.');
    }

    const pairKey = this.pairKey(userId, target.userId);
    const existing = await this.prisma.friendship.findUnique({
      where: { pairKey },
    });

    if (existing) {
      throw new ConflictException('Já existe uma conexão entre estas contas.');
    }

    try {
      await this.prisma.friendship.create({
        data: { requesterId: userId, addresseeId: target.userId, pairKey },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe uma conexão entre estas contas.',
        );
      }

      throw error;
    }

    return { message: 'Pedido de aliança enviado.' };
  }

  async getRanking(category: SocialRankingCategory, limit: number) {
    if (category === 'LEVEL') {
      const characters = await this.prisma.character.findMany({
        where: rankableCharacterWhere,
        orderBy: [
          { level: 'desc' },
          { xp: 'desc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        take: limit,
        select: {
          ...socialCharacterSelect,
          xp: true,
        },
      });

      return this.buildRanking(
        category,
        characters.map(({ xp, ...character }) => ({
          character,
          score: { level: character.level, xp, totalXp: xp },
        })),
      );
    }

    if (category === 'CRAFTING') {
      const skills = await this.prisma.characterCraftingSkill.findMany({
        where: { character: rankableCharacterWhere },
        orderBy: [
          { level: 'desc' },
          { totalXp: 'desc' },
          { createdAt: 'asc' },
          { characterId: 'asc' },
        ],
        take: limit,
        select: {
          level: true,
          xp: true,
          totalXp: true,
          character: { select: socialCharacterSelect },
        },
      });

      return this.buildRanking(
        category,
        skills.map(({ character, level, xp, totalXp }) => ({
          character,
          score: { level, xp, totalXp },
        })),
      );
    }

    if (category === 'HUNTING') {
      const skills = await this.prisma.characterHuntingSkill.findMany({
        where: { character: rankableCharacterWhere },
        orderBy: [
          { level: 'desc' },
          { totalXp: 'desc' },
          { createdAt: 'asc' },
          { characterId: 'asc' },
        ],
        take: limit,
        select: {
          level: true,
          xp: true,
          totalXp: true,
          character: { select: socialCharacterSelect },
        },
      });

      return this.buildRanking(
        category,
        skills.map(({ character, level, xp, totalXp }) => ({
          character,
          score: { level, xp, totalXp },
        })),
      );
    }

    const origin = GATHERING_RANKING_ORIGINS[category];
    if (!origin) {
      throw new BadRequestException('Categoria de ranking inválida.');
    }

    const skills = await this.prisma.characterGatheringSkill.findMany({
      where: {
        origin,
        character: rankableCharacterWhere,
      },
      orderBy: [
        { level: 'desc' },
        { totalXp: 'desc' },
        { createdAt: 'asc' },
        { characterId: 'asc' },
      ],
      take: limit,
      select: {
        level: true,
        xp: true,
        totalXp: true,
        character: { select: socialCharacterSelect },
      },
    });

    return this.buildRanking(
      category,
      skills.map(({ character, level, xp, totalXp }) => ({
        character,
        score: { level, xp, totalXp },
      })),
    );
  }

  async accept(userId: string, friendshipId: string) {
    const updated = await this.prisma.friendship.updateMany({
      where: {
        id: friendshipId,
        addresseeId: userId,
        status: FriendshipStatus.PENDING,
      },
      data: { status: FriendshipStatus.ACCEPTED, acceptedAt: new Date() },
    });

    if (updated.count !== 1) {
      throw new ForbiddenException('Pedido de aliança não encontrado.');
    }

    return { message: 'Aliança aceita.' };
  }

  async remove(userId: string, friendshipId: string) {
    const removed = await this.prisma.friendship.deleteMany({
      where: {
        id: friendshipId,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    });

    if (removed.count !== 1) {
      throw new NotFoundException('Conexão social não encontrada.');
    }

    return { message: 'Conexão removida.' };
  }

  private async buildRanking(
    category: SocialRankingCategory,
    candidates: RankingCandidate[],
  ) {
    const appearances = await this.cosmeticsService.getResolvedAppearances(
      candidates.map(({ character }) => character.id),
    );

    return {
      category,
      label: SOCIAL_RANKING_LABELS[category],
      generatedAt: new Date().toISOString(),
      entries: candidates.map(({ character, score }, index) => ({
        rank: index + 1,
        character,
        score,
        appearance: appearances[character.id] ?? null,
      })),
    };
  }

  private formatFriendship(friendship: FriendshipWithUsers, userId: string) {
    const otherUser =
      friendship.requesterId === userId
        ? friendship.addressee
        : friendship.requester;

    return {
      id: friendship.id,
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      status: friendship.status,
      createdAt: friendship.createdAt,
      acceptedAt: friendship.acceptedAt,
      user: otherUser,
    };
  }

  private pairKey(leftUserId: string, rightUserId: string) {
    return [leftUserId, rightUserId].sort().join(':');
  }
}
