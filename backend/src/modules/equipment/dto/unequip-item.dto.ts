import { ItemSlot } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class UnequipItemDto {
  @IsString()
  characterId: string;

  @IsEnum(ItemSlot)
  slot: ItemSlot;
}
