import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EquipItemDto } from './dto/equip-item.dto';
import { UnequipItemDto } from './dto/unequip-item.dto';
import { ReinforceEquipmentDto } from './dto/reinforce-equipment.dto';
import { EquipmentReinforcementService } from './equipment-reinforcement.service';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
@UseGuards(JwtAuthGuard)
export class EquipmentController {
  constructor(
    private readonly equipmentService: EquipmentService,
    private readonly reinforcementService: EquipmentReinforcementService,
  ) {}

  @Get(':characterId')
  async findByCharacter(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
  ) {
    const [equipment, reinforcement] = await Promise.all([
      this.equipmentService.findByCharacter(request.user.id, characterId),
      this.reinforcementService.getState(request.user.id, characterId),
    ]);

    return { ...equipment, reinforcement };
  }

  @Post('equip')
  equip(
    @Req() request: { user: { id: string } },
    @Body() equipItemDto: EquipItemDto,
  ) {
    return this.equipmentService.equip(request.user.id, equipItemDto);
  }

  @Post('unequip')
  unequip(
    @Req() request: { user: { id: string } },
    @Body() unequipItemDto: UnequipItemDto,
  ) {
    return this.equipmentService.unequip(request.user.id, unequipItemDto);
  }

  @Post('reinforce')
  reinforce(
    @Req() request: { user: { id: string } },
    @Body() reinforceEquipmentDto: ReinforceEquipmentDto,
  ) {
    return this.reinforcementService.reinforce(
      request.user.id,
      reinforceEquipmentDto,
    );
  }
}
