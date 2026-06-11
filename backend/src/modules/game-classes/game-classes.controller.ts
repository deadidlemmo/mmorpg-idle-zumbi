import { Controller, Get, Param } from '@nestjs/common';
import { GameClassesService } from './game-classes.service';

@Controller('game-classes')
export class GameClassesController {
  constructor(private readonly gameClassesService: GameClassesService) {}

  @Get()
  findAll() {
    return this.gameClassesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gameClassesService.findOne(id);
  }
}
