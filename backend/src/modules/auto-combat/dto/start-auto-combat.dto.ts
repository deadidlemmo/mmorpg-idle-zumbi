import { IsOptional, IsUUID } from 'class-validator';

export class StartAutoCombatDto {
  @IsUUID()
  characterId: string;

  @IsOptional()
  @IsUUID()
  subMapId?: string;

  @IsOptional()
  @IsUUID()
  mapId?: string;
}
