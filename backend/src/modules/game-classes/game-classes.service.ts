import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GameClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.gameClass.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.gameClass.findUnique({
      where: { id },
    });
  }
}