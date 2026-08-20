import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CraftingController } from './crafting.controller';
import { CraftingGateway } from './crafting.gateway';
import { CraftingService } from './crafting.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule, AuthModule],
  controllers: [CraftingController],
  providers: [CraftingService, CraftingGateway],
  exports: [CraftingService],
})
export class CraftingModule {}
