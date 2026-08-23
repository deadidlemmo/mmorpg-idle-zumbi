import { CosmeticGrantSource } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class GrantCosmeticsDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cosmeticKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  collectionKey?: string;

  @IsEnum(CosmeticGrantSource)
  source!: CosmeticGrantSource;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceReference?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
