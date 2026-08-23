import { Transform, type TransformFnParams } from 'class-transformer';
import { IsUUID } from 'class-validator';

export class SendFriendRequestDto {
  @IsUUID('4', { message: 'Personagem inválido.' })
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;
    return typeof input === 'string' ? input.trim() : input;
  })
  targetCharacterId: string;
}
