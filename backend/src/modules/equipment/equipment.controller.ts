import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EquipItemDto } from './dto/equip-item.dto';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
@UseGuards(JwtAuthGuard)
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get(':characterId')
  findByCharacter(@Req() request: any, @Param('characterId') characterId: string) {
    return this.equipmentService.findByCharacter(request.user.id, characterId);
  }

  @Post('equip')
  equip(@Req() request: any, @Body() equipItemDto: EquipItemDto) {
    return this.equipmentService.equip(request.user.id, equipItemDto);
  }
}