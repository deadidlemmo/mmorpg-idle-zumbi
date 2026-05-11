import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.item.findMany({
      orderBy: [
        {
          tier: 'asc',
        },
        {
          name: 'asc',
        },
      ],
      include: {
        class: true,
        map: true,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.item.findUnique({
      where: { id },
      include: {
        class: true,
        map: true,
      },
    });
  }
}