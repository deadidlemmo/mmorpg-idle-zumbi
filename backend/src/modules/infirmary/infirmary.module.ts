import { Module } from '@nestjs/common';
import { ActivityGuardModule } from '../../common/activity-guard/activity-guard.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { InfirmaryController } from './infirmary.controller';
import { InfirmaryService } from './infirmary.service';

@Module({
  imports: [PrismaModule, ActivityGuardModule],
  controllers: [InfirmaryController],
  providers: [InfirmaryService],
  exports: [InfirmaryService],
})
export class InfirmaryModule {}