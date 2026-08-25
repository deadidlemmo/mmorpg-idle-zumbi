import { IsIn, IsString, Length } from 'class-validator';

export class ReinforceEquipmentDto {
  @IsString()
  characterId: string;

  @IsIn(['MAIN_HAND', 'OFF_HAND', 'HEAD', 'ARMOR', 'PANTS', 'BOOTS'])
  slot: 'MAIN_HAND' | 'OFF_HAND' | 'HEAD' | 'ARMOR' | 'PANTS' | 'BOOTS';

  @IsString()
  @Length(8, 120)
  requestId: string;
}
