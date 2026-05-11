import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ItemSlot } from '@prisma/client';
import { CraftingService } from './crafting.service';
import { CraftItemDto } from './dto/craft-item.dto';

@Controller('crafting')
export class CraftingController {
  constructor(private readonly craftingService: CraftingService) {}

  @Get('character/:characterId/recipes')
  listCharacterRecipes(
    @Param('characterId') characterId: string,
    @Query('tier') tier?: string,
    @Query('slot') slot?: string,
    @Query('craftableOnly') craftableOnly?: string,
  ) {
    return this.craftingService.listCharacterRecipes({
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
  craft(@Body() dto: CraftItemDto) {
    return this.craftingService.craft(dto);
  }
}