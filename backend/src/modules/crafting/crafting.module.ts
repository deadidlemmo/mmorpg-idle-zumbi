import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CraftingController } from './crafting.controller';
import { CraftingService } from './crafting.service';

@Module({
  imports: [PrismaModule],
  controllers: [CraftingController],
  providers: [CraftingService],
  exports: [CraftingService],
})
export class CraftingModule {}