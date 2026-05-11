import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':characterId')
  findByCharacter(@Req() request: any, @Param('characterId') characterId: string) {
    return this.inventoryService.findByCharacter(request.user.id, characterId);
  }
}