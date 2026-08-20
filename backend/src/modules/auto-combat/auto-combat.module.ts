import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AutoCombatController } from './auto-combat.controller';
import { AutoCombatGateway } from './auto-combat.gateway';
import { AutoCombatService } from './auto-combat.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule, AuthModule],
  controllers: [AutoCombatController],
  providers: [AutoCombatService, AutoCombatGateway],
  exports: [AutoCombatService],
})
export class AutoCombatModule {}
