import { IsNotEmpty, IsUUID } from 'class-validator';

export class UseConsumableDto {
  @IsNotEmpty({
    message: 'O characterId é obrigatório.',
  })
  @IsUUID('4', {
    message: 'O characterId precisa ser um UUID válido.',
  })
  characterId!: string;

  @IsNotEmpty({
    message: 'O itemId é obrigatório.',
  })
  @IsUUID('4', {
    message: 'O itemId precisa ser um UUID válido.',
  })
  itemId!: string;
}