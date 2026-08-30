import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum WorldBossJoinIntent {
  REGISTER = 'REGISTER',
  CONFIRM = 'CONFIRM',
}

export class JoinWorldBossDto {
  @IsString()
  @IsUUID()
  characterId!: string;

  @IsString()
  @IsUUID()
  eventId!: string;

  @IsOptional()
  @IsEnum(WorldBossJoinIntent)
  intent?: WorldBossJoinIntent;
}
