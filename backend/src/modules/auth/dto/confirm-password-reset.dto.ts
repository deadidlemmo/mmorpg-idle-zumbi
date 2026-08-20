import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ConfirmPasswordResetDto {
  @IsString()
  @Length(64, 64, { message: 'Token de recuperacao invalido.' })
  @Matches(/^[a-f0-9]{64}$/i, { message: 'Token de recuperacao invalido.' })
  token: string;

  @IsString({ message: 'A senha deve ser um texto.' })
  @IsNotEmpty({ message: 'Informe uma senha.' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'A senha deve conter pelo menos uma letra e um numero.',
  })
  password: string;
}
