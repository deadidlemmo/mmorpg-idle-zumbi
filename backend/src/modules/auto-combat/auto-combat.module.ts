import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CosmeticsModule } from '../cosmetics/cosmetics.module';
import { ActiveCharacterPresenceService } from './active-character-presence.service';
import { AutoCombatController } from './auto-combat.controller';
import { AutoCombatGateway } from './auto-combat.gateway';
import { AutoCombatService } from './auto-combat.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule, AuthModule, CosmeticsModule],
  controllers: [AutoCombatController],
  providers: [
    AutoCombatService,
    AutoCombatGateway,
    ActiveCharacterPresenceService,
  ],
  exports: [AutoCombatService],
})
export class AutoCombatModule {}
