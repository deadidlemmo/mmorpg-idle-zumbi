import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class ReinforceEquipmentDto {
  @IsString()
  characterId: string;

  @IsOptional()
  @IsIn(['MAIN_HAND', 'OFF_HAND', 'HEAD', 'ARMOR', 'PANTS', 'BOOTS'])
  slot?: 'MAIN_HAND' | 'OFF_HAND' | 'HEAD' | 'ARMOR' | 'PANTS' | 'BOOTS';

  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @IsString()
  @Length(8, 120)
  requestId: string;
}
