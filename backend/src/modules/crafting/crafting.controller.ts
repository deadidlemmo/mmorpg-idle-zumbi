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
import { CraftingGateway } from './crafting.gateway';
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
  constructor(
    private readonly craftingService: CraftingService,
    private readonly craftingGateway: CraftingGateway,
  ) {}

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

  @Get('character/:characterId/status')
  getCharacterCraftingStatus(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    return this.craftingService.getCharacterCraftingStatus(
      this.getUserId(request),
      characterId,
    );
  }

  @Get(':itemId/recipe')
  getRecipe(@Param('itemId') itemId: string) {
    return this.craftingService.getRecipeByOutputItemId(itemId);
  }

  @Post('craft')
  async craft(@Req() request: AuthenticatedRequest, @Body() dto: CraftItemDto) {
    const userId = this.getUserId(request);
    const result = await this.craftingService.craft(userId, dto);

    await this.craftingGateway.emitStartedForCharacter(dto.characterId, userId);

    return result;
  }

  @Post('character/:characterId/stop')
  async stop(
    @Req() request: AuthenticatedRequest,
    @Param('characterId') characterId: string,
  ) {
    const userId = this.getUserId(request);
    const result = await this.craftingService.stop(userId, characterId);

    await this.craftingGateway.emitStoppedForCharacter(characterId, userId);

    return result;
  }
}
