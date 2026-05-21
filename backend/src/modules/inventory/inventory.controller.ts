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
import { MoveInventoryItemDto } from './dto/move-inventory-item.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':characterId')
  findByCharacter(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
  ) {
    return this.inventoryService.findByCharacter(request.user.id, characterId);
  }

  @Get(':characterId/bank')
  findBankByCharacter(
    @Req() request: { user: { id: string } },
    @Param('characterId') characterId: string,
  ) {
    return this.inventoryService.findBankByCharacter(
      request.user.id,
      characterId,
    );
  }

  @Post('bank/deposit')
  depositToBank(
    @Req() request: { user: { id: string } },
    @Body() moveItemDto: MoveInventoryItemDto,
  ) {
    return this.inventoryService.depositToBank(request.user.id, moveItemDto);
  }

  @Post('bank/withdraw')
  withdrawFromBank(
    @Req() request: { user: { id: string } },
    @Body() moveItemDto: MoveInventoryItemDto,
  ) {
    return this.inventoryService.withdrawFromBank(request.user.id, moveItemDto);
  }
}
