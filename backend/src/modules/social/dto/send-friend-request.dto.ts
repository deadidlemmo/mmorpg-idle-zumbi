import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class SendFriendRequestDto {
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : undefined,
  )
  email: string;
}
