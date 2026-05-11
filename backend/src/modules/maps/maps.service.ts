import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MapsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.gameMap.findMany({
      orderBy: {
        tier: 'asc',
      },
      include: {
        subMaps: {
          orderBy: [
            {
              minLevel: 'asc',
            },
            {
              name: 'asc',
            },
          ],
          include: {
            encounters: {
              where: {
                isActive: true,
              },
              include: {
                mob: true,
              },
            },
          },
        },
        mobs: {
          orderBy: [
            {
              level: 'asc',
            },
            {
              name: 'asc',
            },
          ],
        },
        items: {
          orderBy: [
            {
              tier: 'asc',
            },
            {
              name: 'asc',
            },
          ],
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.gameMap.findUnique({
      where: { id },
      include: {
        subMaps: {
          orderBy: [
            {
              minLevel: 'asc',
            },
            {
              name: 'asc',
            },
          ],
          include: {
            encounters: {
              where: {
                isActive: true,
              },
              include: {
                mob: true,
              },
            },
          },
        },
        mobs: {
          orderBy: [
            {
              level: 'asc',
            },
            {
              name: 'asc',
            },
          ],
          include: {
            drops: {
              include: {
                item: true,
              },
            },
          },
        },
        items: {
          orderBy: [
            {
              tier: 'asc',
            },
            {
              name: 'asc',
            },
          ],
        },
      },
    });
  }
}