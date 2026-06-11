import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class PreviewAutoCombatDto {
  @IsUUID()
  characterId: string;

  @IsOptional()
  @IsUUID()
  subMapId?: string;

  @IsOptional()
  @IsUUID()
  mapId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(43200)
  projectionSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(14)
  iterations?: number;
}
