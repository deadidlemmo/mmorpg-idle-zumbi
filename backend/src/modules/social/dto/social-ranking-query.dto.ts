import { Transform, type TransformFnParams, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  SOCIAL_RANKING_CATEGORIES,
  type SocialRankingCategory,
} from '../social.constants';

export class SocialRankingQueryDto {
  @IsIn(SOCIAL_RANKING_CATEGORIES, {
    message: 'Categoria de ranking inválida.',
  })
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim().toUpperCase() : input;
  })
  category: SocialRankingCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O limite do ranking deve ser inteiro.' })
  @Min(1)
  @Max(50)
  limit = 50;
}
