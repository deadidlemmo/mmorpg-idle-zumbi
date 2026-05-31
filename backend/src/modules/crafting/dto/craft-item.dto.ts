import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CraftItemDto {
  @IsString()
  characterId: string;

  @IsString()
  itemId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
