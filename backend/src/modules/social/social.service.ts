import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const friendInclude = {
  requester: {
    select: {
      id: true,
      email: true,
      characters: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          level: true,
          avatarKey: true,
          class: { select: { name: true } },
        },
      },
    },
  },
  addressee: {
    select: {
      id: true,
      email: true,
      characters: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          level: true,
          avatarKey: true,
          class: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.FriendshipInclude;

type FriendshipWithUsers = Prisma.FriendshipGetPayload<{
  include: typeof friendInclude;
}>;

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      orderBy: { updatedAt: 'desc' },
      include: friendInclude,
    });

    return {
      friends: friendships
        .filter((friendship) => friendship.status === FriendshipStatus.ACCEPTED)
        .map((friendship) => this.formatFriendship(friendship, userId)),
      incoming: friendships
        .filter(
          (friendship) =>
            friendship.status === FriendshipStatus.PENDING &&
            friendship.addresseeId === userId,
        )
        .map((friendship) => this.formatFriendship(friendship, userId)),
      outgoing: friendships
        .filter(
          (friendship) =>
            friendship.status === FriendshipStatus.PENDING &&
            friendship.requesterId === userId,
        )
        .map((friendship) => this.formatFriendship(friendship, userId)),
    };
  }

  async sendRequest(userId: string, email: string) {
    const target = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, isSuspended: true },
    });

    if (!target || target.isSuspended) {
      throw new NotFoundException('Sobrevivente nao encontrado.');
    }
    if (target.id === userId) {
      throw new ConflictException('Voce nao pode adicionar a propria conta.');
    }

    const pairKey = [userId, target.id].sort().join(':');
    const existing = await this.prisma.friendship.findUnique({
      where: { pairKey },
    });

    if (existing) {
      throw new ConflictException('Ja existe uma conexao entre estas contas.');
    }

    try {
      await this.prisma.friendship.create({
        data: { requesterId: userId, addresseeId: target.id, pairKey },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ja existe uma conexao entre estas contas.',
        );
      }

      throw error;
    }

    return { message: 'Pedido de amizade enviado.' };
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
      throw new ForbiddenException('Pedido de amizade nao encontrado.');
    }

    return { message: 'Amizade aceita.' };
  }

  async remove(userId: string, friendshipId: string) {
    const removed = await this.prisma.friendship.deleteMany({
      where: {
        id: friendshipId,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    });

    if (removed.count !== 1) {
      throw new NotFoundException('Conexao social nao encontrada.');
    }

    return { message: 'Conexao removida.' };
  }

  private formatFriendship(friendship: FriendshipWithUsers, userId: string) {
    const otherUser =
      friendship.requesterId === userId
        ? friendship.addressee
        : friendship.requester;

    return {
      id: friendship.id,
      status: friendship.status,
      createdAt: friendship.createdAt,
      acceptedAt: friendship.acceptedAt,
      user: otherUser,
    };
  }
}
