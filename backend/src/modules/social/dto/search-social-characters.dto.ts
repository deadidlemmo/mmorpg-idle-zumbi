import { Transform, type TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchSocialCharactersDto {
  @IsString({ message: 'Informe o apelido do personagem.' })
  @MinLength(2, { message: 'Digite pelo menos 2 caracteres.' })
  @MaxLength(24, { message: 'O apelido deve ter no máximo 24 caracteres.' })
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    return typeof input === 'string'
      ? input.trim().replace(/\s+/g, ' ')
      : input;
  })
  nickname: string;
}
