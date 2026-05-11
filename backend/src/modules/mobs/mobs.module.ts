import { Module } from '@nestjs/common';
import { MobsController } from './mobs.controller';
import { MobsService } from './mobs.service';

@Module({
  controllers: [MobsController],
  providers: [MobsService]
})
export class MobsModule {}
