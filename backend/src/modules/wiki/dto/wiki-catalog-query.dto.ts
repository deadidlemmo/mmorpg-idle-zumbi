import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ItemSlot, Rarity } from '@prisma/client';
import { WIKI_LAUNCH_TIER_CAP } from '../wiki.constants';

export class WikiCatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WIKI_LAUNCH_TIER_CAP)
  tier?: number;

  @IsOptional()
  @IsEnum(Rarity)
  rarity?: Rarity;

  @IsOptional()
  @IsEnum(ItemSlot)
  slot?: ItemSlot;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  mapId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  minLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize?: number;
}
