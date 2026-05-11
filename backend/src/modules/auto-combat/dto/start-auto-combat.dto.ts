import { IsUUID } from 'class-validator';

export class StartAutoCombatDto {
  @IsUUID()
  characterId: string;

  @IsUUID()
  subMapId: string;
}