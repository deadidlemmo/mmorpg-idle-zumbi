import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GrantCraftingMaterialsDto {
  @IsInt()
  @Min(1)
  @Max(6)
  recipeCount!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  craftsPerRecipe!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  reason!: string;

  @IsUUID()
  requestId!: string;
}
