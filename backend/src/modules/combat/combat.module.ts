import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { CombatController } from './combat.controller';
import { CombatService } from './combat.service';

@Module({
  imports: [ActivityGuardModule],
  controllers: [CombatController],
  providers: [CombatService],
})
export class CombatModule {}
