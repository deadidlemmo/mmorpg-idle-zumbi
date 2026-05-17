import { IsString, IsUUID } from 'class-validator';

export class JoinWorldBossDto {
  @IsString()
  @IsUUID()
  characterId!: string;

  @IsString()
  @IsUUID()
  eventId!: string;
}
