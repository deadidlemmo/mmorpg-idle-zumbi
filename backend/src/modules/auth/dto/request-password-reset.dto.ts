import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(120, { message: 'O e-mail deve ter no maximo 120 caracteres.' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : undefined,
  )
  email: string;
}
