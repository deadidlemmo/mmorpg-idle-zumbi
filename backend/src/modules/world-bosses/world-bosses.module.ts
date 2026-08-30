import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AutoCombatModule } from '../auto-combat/auto-combat.module';
import { CraftingModule } from '../crafting/crafting.module';
import { GatheringModule } from '../gathering/gathering.module';
import { IncursionsModule } from '../incursions/incursions.module';
import { WorldBossesController } from './world-bosses.controller';
import { WorldBossesGateway } from './world-bosses.gateway';
import { WorldBossesService } from './world-bosses.service';

@Module({
  imports: [
    PrismaModule,
    ActivityGuardModule,
    AuthModule,
    AutoCombatModule,
    CraftingModule,
    GatheringModule,
    IncursionsModule,
  ],
  controllers: [WorldBossesController],
  providers: [WorldBossesService, WorldBossesGateway],
  exports: [WorldBossesService],
})
export class WorldBossesModule {}
