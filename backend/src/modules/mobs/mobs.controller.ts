import { Controller, Get, Param } from '@nestjs/common';
import { MobsService } from './mobs.service';

@Controller('mobs')
export class MobsController {
  constructor(private readonly mobsService: MobsService) {}

  @Get()
  findAll() {
    return this.mobsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mobsService.findOne(id);
  }
}