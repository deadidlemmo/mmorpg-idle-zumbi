import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MobsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.mob.findMany({
      orderBy: [
        {
          tier: 'asc',
        },
        {
          level: 'asc',
        },
      ],
      include: {
        map: true,
        drops: {
          include: {
            item: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.mob.findUnique({
      where: { id },
      include: {
        map: true,
        drops: {
          include: {
            item: true,
          },
        },
      },
    });
  }
}