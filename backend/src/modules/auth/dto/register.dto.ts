import { Transform } from 'class-transformer';
import {
  IsEmail,
  Equals,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(120, { message: 'O e-mail deve ter no máximo 120 caracteres.' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString({ message: 'A senha deve ser um texto.' })
  @IsNotEmpty({ message: 'Informe uma senha.' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'A senha deve conter pelo menos uma letra e um número.',
  })
  password: string;

  @Equals(true, { message: 'E necessario aceitar os Termos de Uso.' })
  acceptTerms: boolean;

  @Equals(true, { message: 'E necessario aceitar a Politica de Privacidade.' })
  acceptPrivacy: boolean;
}
