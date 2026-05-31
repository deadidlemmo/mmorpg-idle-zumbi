import { MaterialOrigin } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class StartGatheringDto {
  @IsString()
  characterId: string;

  @IsString()
  mapId: string;

  @IsEnum(MaterialOrigin)
  origin: MaterialOrigin;

  @IsString()
  targetMaterialId: string;
}
