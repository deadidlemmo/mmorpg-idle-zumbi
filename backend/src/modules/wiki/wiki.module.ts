import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

@Module({
  imports: [PrismaModule],
  controllers: [WikiController],
  providers: [WikiService],
})
export class WikiModule {}
