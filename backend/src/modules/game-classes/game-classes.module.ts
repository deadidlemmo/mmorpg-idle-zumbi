import { Module } from '@nestjs/common';
import { GameClassesController } from './game-classes.controller';
import { GameClassesService } from './game-classes.service';

@Module({
  controllers: [GameClassesController],
  providers: [GameClassesService]
})
export class GameClassesModule {}
