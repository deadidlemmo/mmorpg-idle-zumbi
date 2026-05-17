import { IsString, IsUUID } from 'class-validator';

export class LeaveWorldBossDto {
  @IsString()
  @IsUUID()
  characterId!: string;

  @IsString()
  @IsUUID()
  eventId!: string;
}
