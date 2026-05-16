import { IsString, IsUUID } from 'class-validator';

export class StartIncursionDto {
  @IsString()
  @IsUUID()
  characterId: string;

  @IsString()
  @IsUUID()
  incursionId: string;
}
