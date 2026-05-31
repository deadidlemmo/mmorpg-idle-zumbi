import { IsString } from 'class-validator';

export class StartCombatDto {
  @IsString()
  characterId: string;

  @IsString()
  mobId: string;
}
