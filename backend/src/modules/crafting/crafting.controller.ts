import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ItemSlot } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CraftingService } from './crafting.service';
import { CraftItemDto } from './dto/craft-item.dto';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    userId?: string;
    sub?: string;
  };
};

@Controller('crafting')
@UseGuards(JwtAuthGuard)
export class CraftingController {
  constructor(private readonly craftingService: CraftingService) {}

  private getUserId(request: AuthenticatedRequest): string {
    const userId =
      request.user?.id ?? request.user?.userId ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Usuario nao autenticado.');
    }

    return userId;
  }

  @Get('character/:characterId/recipes')
  listCharacterRecipes(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
    @Query('tier') tier?: string,
    @Query('slot') slot?: string,
    @Query('craftableOnly') craftableOnly?: string,
  ) {
    return this.craftingService.listCharacterRecipes({
      userId: this.getUserId(request),
      characterId,
      tier: tier ? Number(tier) : undefined,
      slot: slot ? (slot as ItemSlot) : undefined,
      craftableOnly: craftableOnly === 'true',
    });
  }

  @Get(':itemId/recipe')
  getRecipe(@Param('itemId') itemId: string) {
    return this.craftingService.getRecipeByOutputItemId(itemId);
  }

  @Post('craft')
  craft(@Req() request: AuthenticatedRequest, @Body() dto: CraftItemDto) {
    return this.craftingService.craft(this.getUserId(request), dto);
  }
}
