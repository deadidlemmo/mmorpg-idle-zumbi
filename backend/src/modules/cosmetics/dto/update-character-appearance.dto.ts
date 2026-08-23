import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCharacterAppearanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  avatarCosmeticKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  avatarFrameCosmeticKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  profileBannerCosmeticKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  overviewBackgroundCosmeticKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  profileEffectCosmeticKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  titleCosmeticKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  badgeCosmeticKey?: string | null;
}
