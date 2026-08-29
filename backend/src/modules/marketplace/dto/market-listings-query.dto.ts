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
import { InventoryItemType, MarketListingStatus, Rarity } from '@prisma/client';

export enum MarketListingSort {
  NEWEST = 'NEWEST',
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  QUANTITY_DESC = 'QUANTITY_DESC',
}

export class MarketListingsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsEnum(InventoryItemType)
  type?: InventoryItemType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  tier?: number;

  @IsOptional()
  @IsEnum(Rarity)
  rarity?: Rarity;

  @IsOptional()
  @IsEnum(MarketListingStatus)
  status?: MarketListingStatus;

  @IsOptional()
  @IsEnum(MarketListingSort)
  sort?: MarketListingSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
