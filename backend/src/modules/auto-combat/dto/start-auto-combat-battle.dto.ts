import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export enum AutoCombatBattleMode {
  SINGLE = 'SINGLE',
  ALL = 'ALL',
}

export class StartAutoCombatBattleDto {
  @IsOptional()
  @IsEnum(AutoCombatBattleMode)
  mode?: AutoCombatBattleMode;

  @IsOptional()
  @IsUUID()
  mobId?: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}
